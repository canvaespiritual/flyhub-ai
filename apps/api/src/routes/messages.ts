import { publish } from '../lib/realtime.js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const createMessageSchema = z.object({
  tenantId: z.string().min(1, 'tenantId é obrigatório'),
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

// 🔥 NOVO: função da janela de 24h
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

    if (!parsed.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsed.error.flatten()
      })
    }

    const { tenantId, conversationId, senderUserId, type, content } = parsed.data

    // 🔍 Buscar conversa com dados necessários
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        tenantId
      },
      include: {
        phoneNumber: true
      }
    })

    if (!conversation) {
      return reply.status(404).send({
        message: 'Conversation not found'
      })
    }

    // 🔒 STATUS
    if (conversation.status === 'CLOSED') {
      return reply.status(409).send({
        message: 'Conversation is closed'
      })
    }

    // 🔒 MODO
    if (conversation.mode !== 'MANUAL') {
      return reply.status(409).send({
        message: 'Conversation is not in manual mode'
      })
    }

    // 🔒 JANELA 24H (CRÍTICO)
    const isInsideWindow = isWithin24hWindow(conversation.lastInboundAt)

    if (!isInsideWindow) {
      return reply.status(409).send({
        message: 'Outside WhatsApp 24h window',
        code: 'WHATSAPP_WINDOW_CLOSED',
        requiresTemplate: true
      })
    }

    // 🔒 VALIDAÇÃO DE USUÁRIO
    if (senderUserId) {
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

      if (conversation.assignedUserId && conversation.assignedUserId !== senderUserId) {
        return reply.status(409).send({
          message: 'Conversation is assigned to another user'
        })
      }
    }

    // 🔒 VALIDAÇÃO DE CONTEÚDO
    if (type === 'text' && (!content || !content.trim())) {
      return reply.status(400).send({
        message: 'Text message cannot be empty'
      })
    }

    const now = new Date()

    const message = await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.message.create({
        data: {
          conversationId,
          senderUserId: senderUserId ?? conversation.assignedUserId ?? null,
          senderType: 'AGENT',
          direction: 'OUTBOUND',
          type: mapMessageTypeToPrisma(type),
          status: 'QUEUED',
          provider: conversation.phoneNumber.provider,
          content: content ?? ''
        }
      })

      await tx.conversation.update({
        where: {
          id: conversationId
        },
        data: {
          lastMessageAt: now,
          lastOutboundAt: now
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

// 🔥 AQUI ESTÁ A MÁGICA
publish(tenantId, {
  type: 'message:new',
  payload: response
})

return response
  })
}