import { publish } from '../lib/realtime.js'
import { getSessionFromRequest } from '../lib/auth.js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { canOperateConversation } from '../lib/assignment-policy.js'
import { sendWhatsAppTextMessage } from '../lib/whatsapp.js'

const createMessageSchema = z.object({
  tenantId: z.string().min(1, 'tenantId é obrigatório').optional(),
  conversationId: z.string().min(1, 'conversationId é obrigatório'),
  senderUserId: z.string().min(1).optional(),
  type: z.enum(['text', 'audio', 'image', 'document']),
  content: z.string().optional()
})

function mapMessageTypeToPrisma(type: 'text' | 'audio' | 'image' | 'document') {
  return type.toUpperCase() as 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT'
}

function mapMessageSenderTypeFromPrisma(senderType: 'LEAD' | 'AGENT' | 'AI' | 'SYSTEM') {
  return senderType.toLowerCase()
}

function mapMessageTypeFromPrisma(type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT') {
  return type.toLowerCase()
}

function mapMessageStatusFromPrisma(status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED') {
  return status.toLowerCase()
}

function mapMessageDirectionFromPrisma(direction: 'INBOUND' | 'OUTBOUND') {
  return direction.toLowerCase()
}

function isWithin24hWindow(lastInboundAt?: Date | null) {
  if (!lastInboundAt) return false

  const now = Date.now()
  const last = new Date(lastInboundAt).getTime()

  const diffHours = (now - last) / (1000 * 60 * 60)

  return diffHours <= 24
}

export async function messageRoutes(app: FastifyInstance) {
  app.post('/messages', async (request, reply) => {
    const parsed = createMessageSchema.safeParse(request.body)
    const session = await getSessionFromRequest(request)

    if (!parsed.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsed.error.flatten()
      })
    }

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const { conversationId, type, content } = parsed.data
    const tenantId = session.user.tenantId
    const senderUserId = session.user.id
    const currentUserRole = session.user.role

    const conversation = await prisma.conversation.findFirst({
  where: {
    id: conversationId,
    tenantId
  },
  include: {
    contact: true,
    phoneNumber: true,
    assignedUser: true
  }
})

    if (!conversation) {
      return reply.status(404).send({
        message: 'Conversation not found'
      })
    }

    const canOperate = canOperateConversation(
      {
        id: senderUserId,
        tenantId,
        role: currentUserRole
      },
      {
        id: conversation.id,
        tenantId: conversation.tenantId,
        assignedUserId: conversation.assignedUserId,
        assignedUser: conversation.assignedUser
      },
      {
        allowAgentUnassigned: false
      }
    )

    if (!canOperate) {
      if (currentUserRole === 'AGENT' && !conversation.assignedUserId) {
        return reply.status(409).send({
          message: 'Assuma a conversa antes de responder manualmente'
        })
      }

      return reply.status(409).send({
        message: 'Conversation is assigned to another user'
      })
    }

    if (conversation.status === 'CLOSED') {
      return reply.status(409).send({
        message: 'Conversation is closed'
      })
    }

    if (conversation.mode !== 'MANUAL') {
      return reply.status(409).send({
        message: 'Conversation is not in manual mode'
      })
    }

    const isInsideWindow = isWithin24hWindow(conversation.lastInboundAt)

    if (!isInsideWindow) {
      return reply.status(409).send({
        message: 'Outside WhatsApp 24h window',
        code: 'WHATSAPP_WINDOW_CLOSED',
        requiresTemplate: true
      })
    }

    const senderUser = await prisma.user.findFirst({
      where: {
        id: senderUserId,
        tenantId,
        isActive: true
      },
      select: {
        id: true
      }
    })

    if (!senderUser) {
      return reply.status(404).send({
        message: 'Sender user not found'
      })
    }

    if (type === 'text' && (!content || !content.trim())) {
      return reply.status(400).send({
        message: 'Text message cannot be empty'
      })
    }

    const now = new Date()
    if (type !== 'text') {
  return reply.status(400).send({
    message: 'Only text messages are supported in this first WhatsApp sending version'
  })
}

if (!conversation.phoneNumber.externalId) {
  return reply.status(400).send({
    message: 'Phone number is not configured with WhatsApp externalId'
  })
}

if (!conversation.contact.phone) {
  return reply.status(400).send({
    message: 'Contact phone is missing'
  })
}

const waResponse = await sendWhatsAppTextMessage({
  phoneNumberId: conversation.phoneNumber.externalId,
  to: conversation.contact.phone,
  text: content!.trim()
})

    const message = await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.message.create({
        data: {
          conversationId,
          senderUserId,
          senderType: 'AGENT',
          direction: 'OUTBOUND',
          type: mapMessageTypeToPrisma(type),
          status: 'SENT',
          provider: conversation.phoneNumber.provider,
          content: content ?? '',
          externalMessageId: waResponse.messages?.[0]?.id ?? null,
          externalStatus: 'sent'
        }
      })

      await tx.conversation.update({
  where: {
    id: conversationId
  },
  data: {
    lastMessageAt: now,
    lastOutboundAt: now,
    firstResponseAt: conversation.firstResponseAt ?? now
  }
})

      return createdMessage
    })

    const response = {
      id: message.id,
      conversationId: message.conversationId,
      senderType: mapMessageSenderTypeFromPrisma(message.senderType),
      direction: mapMessageDirectionFromPrisma(message.direction),
      type: mapMessageTypeFromPrisma(message.type),
      content: message.content ?? '',
      mediaUrl: message.mediaUrl ?? undefined,
      mimeType: message.mimeType ?? undefined,
      fileName: message.fileName ?? undefined,
      durationSeconds: message.durationSeconds ?? undefined,
      status: mapMessageStatusFromPrisma(message.status),
      createdAt: message.createdAt.toISOString()
    }

    publish(tenantId, {
      type: 'message:new',
      payload: response
    })

    return response
  })
}