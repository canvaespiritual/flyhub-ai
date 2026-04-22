import { publish } from '../lib/realtime.js'
import { getSessionFromRequest } from '../lib/auth.js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import {
  buildConversationAccessWhere,
  buildConversationListWhere,
  canChangeConversationMode,
  resolveAssignmentTarget
} from '../lib/assignment-policy.js'
import { autoAssignConversation } from '../lib/auto-assignment.js'
import { isUserEligibleForAssignment } from '../lib/routing-policy.js'
import { cancelConversationAutomation } from '../lib/conversation-automation.js'

const paramsSchema = z.object({
  id: z.string().min(1)
})

const conversationMessagesQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  before: z.string().datetime().optional()
})

const updateConversationModeSchema = z.object({
  tenantId: z.string().min(1).optional(),
  mode: z.enum(['manual', 'ai'])
})

const updateConversationAssignmentSchema = z.object({
  tenantId: z.string().min(1).optional(),
  userId: z.string().min(1).nullable().optional(),
  assignedByUserId: z.string().min(1).optional(),
  reason: z.string().trim().min(1).max(500).optional()
})

function mapConversationMode(mode: 'MANUAL' | 'AI') {
  switch (mode) {
    case 'AI':
      return 'ai'
    case 'MANUAL':
    default:
      return 'manual'
  }
}

function mapConversationChannel(
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'
) {
  switch (channel) {
    case 'WHATSAPP':
      return 'whatsapp'
    case 'INSTAGRAM':
      return 'instagram'
    case 'FACEBOOK':
      return 'facebook'
    case 'WEBCHAT':
      return 'webchat'
    default:
      return 'whatsapp'
  }
}

function mapMessageSenderType(senderType: 'LEAD' | 'AGENT' | 'AI' | 'SYSTEM') {
  switch (senderType) {
    case 'LEAD':
      return 'lead'
    case 'AGENT':
      return 'agent'
    case 'AI':
      return 'ai'
    case 'SYSTEM':
      return 'system'
    default:
      return 'system'
  }
}

function mapMessageType(
  type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION'
) {
  switch (type) {
    case 'TEXT':
      return 'text'
    case 'AUDIO':
      return 'audio'
    case 'IMAGE':
      return 'image'
    case 'DOCUMENT':
      return 'document'
    case 'VIDEO':
      return 'video'
    case 'LOCATION':
      return 'location'
    default:
      return 'text'
  }
}

function mapMessageStatus(status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED') {
  switch (status) {
    case 'QUEUED':
      return 'queued'
    case 'SENT':
      return 'sent'
    case 'DELIVERED':
      return 'delivered'
    case 'READ':
      return 'read'
    case 'FAILED':
      return 'failed'
    default:
      return 'sent'
  }
}

function mapMessageDirection(direction: 'INBOUND' | 'OUTBOUND') {
  switch (direction) {
    case 'INBOUND':
      return 'inbound'
    case 'OUTBOUND':
      return 'outbound'
    default:
      return 'outbound'
  }
}

function mapConversationStatus(status: 'OPEN' | 'PENDING' | 'CLOSED') {
  switch (status) {
    case 'OPEN':
      return 'open'
    case 'PENDING':
      return 'pending'
    case 'CLOSED':
      return 'closed'
    default:
      return 'open'
  }
}

function mapConversationPriority(priority: 'LOW' | 'NORMAL' | 'HIGH') {
  switch (priority) {
    case 'LOW':
      return 'low'
    case 'HIGH':
      return 'high'
    case 'NORMAL':
    default:
      return 'normal'
  }
}

function serializeAssignedUser(
  user:
    | {
        id: string
        name: string
        email: string
        role?: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT' | null
      }
    | null
    | undefined
) {
  if (!user) return null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role?.toLowerCase() ?? 'agent'
  }
}

function serializePhoneNumber(phoneNumber: {
  id: string
  number: string
  label: string | null
}) {
  return {
    id: phoneNumber.id,
    number: phoneNumber.number,
    label: phoneNumber.label ?? undefined
  }
}

function serializeMessage(
  message: {
    id: string
    conversationId: string
    senderType: 'LEAD' | 'AGENT' | 'AI' | 'SYSTEM'
    direction: 'INBOUND' | 'OUTBOUND'
    type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION'
    status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
    content: string | null
    mediaUrl: string | null
    mimeType: string | null
    fileName: string | null
    durationSeconds: number | null
        latitude: number | null
    longitude: number | null
    locationName: string | null
    locationAddress: string | null
    createdAt: Date
    senderUser?: {
      id: string
      name: string
      email: string
      role?: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT' | null
    } | null
  }
) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderType: mapMessageSenderType(message.senderType),
    direction: mapMessageDirection(message.direction),
    type: mapMessageType(message.type),
    content: message.content ?? '',
    mediaUrl: message.mediaUrl ?? undefined,
    mimeType: message.mimeType ?? undefined,
    fileName: message.fileName ?? undefined,
    durationSeconds: message.durationSeconds ?? undefined,
        latitude: message.latitude ?? undefined,
    longitude: message.longitude ?? undefined,
    locationName: message.locationName ?? undefined,
    locationAddress: message.locationAddress ?? undefined,
    status: mapMessageStatus(message.status),
    createdAt: message.createdAt.toISOString(),
    senderUser: message.senderUser
      ? {
          id: message.senderUser.id,
          name: message.senderUser.name,
          email: message.senderUser.email,
          role: message.senderUser.role?.toLowerCase() ?? 'agent'
        }
      : null
  }
}

function serializeConversationUpdate(conversation: {
  id: string
  mode: 'MANUAL' | 'AI'
  status: 'OPEN' | 'PENDING' | 'CLOSED'
  priority?: 'LOW' | 'NORMAL' | 'HIGH'
  updatedAt: Date
  assignedAt?: Date | null
  waitingSince?: Date | null
  firstResponseAt?: Date | null
  closedAt?: Date | null
  subject?: string | null
  metaThreadId?: string | null
  campaignId?: string | null
  managerId?: string | null
  assignedUser: {
    id: string
    name: string
    email: string
    role?: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT' | null
  } | null
  phoneNumber: {
    id: string
    number: string
    label: string | null
  }
}) {
  return {
    id: conversation.id,
    mode: mapConversationMode(conversation.mode),
    status: mapConversationStatus(conversation.status),
    priority: conversation.priority ? mapConversationPriority(conversation.priority) : 'normal',
    updatedAt: conversation.updatedAt.toISOString(),
    assignedAt: conversation.assignedAt?.toISOString(),
    waitingSince: conversation.waitingSince?.toISOString(),
    firstResponseAt: conversation.firstResponseAt?.toISOString(),
    closedAt: conversation.closedAt?.toISOString(),
    subject: conversation.subject ?? undefined,
    metaThreadId: conversation.metaThreadId ?? undefined,
    campaignId: conversation.campaignId ?? undefined,
    managerId: conversation.managerId ?? undefined,
    assignedUser: serializeAssignedUser(conversation.assignedUser),
    phoneNumber: serializePhoneNumber(conversation.phoneNumber)
  }
}

export async function conversationRoutes(app: FastifyInstance) {
  app.get('/conversations', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const tenantId = session.user.tenantId
    const currentUserId = session.user.id
    const currentUserRole = session.user.role

        const conversations = await prisma.conversation.findMany({
      where: buildConversationListWhere(
        {
          id: currentUserId,
          tenantId,
          role: currentUserRole
        },
        {
           allowAgentUnassigned: true
        }
      ),
      include: {
        contact: true,
        assignedUser: true,
        phoneNumber: true,
        
        messages: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1,
          include: {
            senderUser: true
          }
        }
        
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    const unreadCountsEntries = await Promise.all(
  conversations.map(async (conversation) => {
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        ...(conversation.lastSeenAt
          ? {
              createdAt: {
                gt: conversation.lastSeenAt
              }
            }
          : {})
      }
    })

    return [conversation.id, unreadCount] as const
  })
)

const unreadCountsMap = Object.fromEntries(unreadCountsEntries)

    return conversations.map((conversation) => {
  const lastMessage = conversation.messages[0]

  const unreadCount = unreadCountsMap[conversation.id] ?? 0

  return {
    id: conversation.id,
    leadId: conversation.contact.id,
    channel: mapConversationChannel(conversation.channel),
    mode: mapConversationMode(conversation.mode),
    status: mapConversationStatus(conversation.status),
    priority: mapConversationPriority(conversation.priority),
    subject: conversation.subject ?? undefined,
    metaThreadId: conversation.metaThreadId ?? undefined,
    campaignId: conversation.campaignId ?? undefined,
    managerId: conversation.managerId ?? undefined,
    messages: [],
    lastMessage: lastMessage ? serializeMessage(lastMessage) : undefined,
    unreadCount,
    updatedAt: conversation.updatedAt.toISOString(),
        assignedAt: conversation.assignedAt?.toISOString(),
        waitingSince: conversation.waitingSince?.toISOString(),
        firstResponseAt: conversation.firstResponseAt?.toISOString(),
        closedAt: conversation.closedAt?.toISOString(),
        assignedUser: serializeAssignedUser(conversation.assignedUser),
        phoneNumber: serializePhoneNumber(conversation.phoneNumber)
      }
    })
  })
    app.delete('/conversations/:id', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params)
    const session = await getSessionFromRequest(request)

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Invalid conversation id'
      })
    }

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const { id } = parsedParams.data
    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role

    // 🔒 permissão: só MASTER e ADMIN
    if (currentUserRole !== 'MASTER' && currentUserRole !== 'ADMIN') {
      return reply.status(403).send({
        message: 'Sem permissão para apagar conversa'
      })
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        tenantId
      },
      select: {
        id: true
      }
    })

    if (!conversation) {
      return reply.status(404).send({
        message: 'Conversation not found'
      })
    }

    // 🔥 delete (cascade cuida de messages/assignments)
    await prisma.conversation.delete({
      where: {
        id
      }
    })

    return {
      ok: true
    }
  })
  app.get('/conversations/:id/messages', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params)
    const parsedQuery = conversationMessagesQuerySchema.safeParse(request.query)
    const session = await getSessionFromRequest(request)

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Invalid conversation id'
      })
    }

    if (!parsedQuery.success) {
      return reply.status(400).send({
        message: 'Invalid query params',
        issues: parsedQuery.error.flatten()
      })
    }

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const { id } = parsedParams.data
    const { limit, before } = parsedQuery.data
    const tenantId = session.user.tenantId
    const currentUserId = session.user.id
    const currentUserRole = session.user.role

        const conversation = await prisma.conversation.findFirst({
      where: buildConversationAccessWhere(
        {
          id: currentUserId,
          tenantId,
          role: currentUserRole
        },
        id,
        {
           allowAgentUnassigned: true
        }
      ),
      select: {
        id: true
      }
    })

    if (!conversation) {
      return reply.status(404).send({
        message: 'Conversation not found'
      })
    }
        await prisma.conversation.update({
      where: {
        id
      },
      data: {
        lastSeenAt: new Date()
      }
    })

    const where = {
      conversationId: id,
      ...(before
        ? {
            createdAt: {
              lt: new Date(before)
            }
          }
        : {})
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: limit + 1,
      include: {
        senderUser: true
      }
    })

    const hasMore = messages.length > limit
    const slicedMessages = hasMore ? messages.slice(0, limit) : messages

    const orderedMessages = slicedMessages.reverse()
    const serializedItems = orderedMessages.map((message) => serializeMessage(message))

    const oldestLoadedMessage = slicedMessages[slicedMessages.length - 1]
    const nextCursor =
      hasMore && oldestLoadedMessage ? oldestLoadedMessage.createdAt.toISOString() : null

    return {
      items: serializedItems,
      hasMore,
      nextCursor
    }
  })

  app.get('/conversations/:id/lead', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params)
    const session = await getSessionFromRequest(request)

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Invalid conversation id'
      })
    }

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const { id } = parsedParams.data
    const tenantId = session.user.tenantId
    const currentUserId = session.user.id
    const currentUserRole = session.user.role

        const conversation = await prisma.conversation.findFirst({
      where: buildConversationAccessWhere(
        {
          id: currentUserId,
          tenantId,
          role: currentUserRole
        },
        id,
        {
           allowAgentUnassigned: true
        }
      ),
      include: {
        contact: true
      }
    })

    if (!conversation) {
      return reply.status(404).send({
        message: 'Conversation not found'
      })
    }

    return {
      id: conversation.contact.id,
      name: conversation.contact.name,
      phone: conversation.contact.phone,
      email: conversation.contact.email ?? undefined,
      stage: 'new',
      temperature: 'warm',
      interest: undefined,
      income: undefined,
      notes: undefined,
      flyImobLeadId: conversation.contact.flyImobLeadId ?? undefined
    }
  })

  app.patch('/conversations/:id/mode', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params)
    const parsedBody = updateConversationModeSchema.safeParse(request.body)
    const session = await getSessionFromRequest(request)

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Invalid conversation id'
      })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const { id } = parsedParams.data
    const { mode } = parsedBody.data
    const tenantId = session.user.tenantId
    const currentUserId = session.user.id
    const currentUserRole = session.user.role

        const conversation = await prisma.conversation.findFirst({
      where: buildConversationAccessWhere(
        {
          id: currentUserId,
          tenantId,
          role: currentUserRole
        },
        id,
        {
           allowAgentUnassigned: false
        }
      )
    })

    if (!conversation) {
      return reply.status(404).send({
        message: 'Conversation not found'
      })
    }
        if (
      !canChangeConversationMode(
        {
          id: currentUserId,
          tenantId,
          role: currentUserRole
        },
        {
          id: conversation.id,
          tenantId: conversation.tenantId,
          assignedUserId: conversation.assignedUserId
        },
        {
          allowAgentUnassigned: false
        }
      )
    ) {
      return reply.status(403).send({
        message: 'You are not allowed to change this conversation mode'
      })
    }
    const newMode = mode === 'ai' ? 'AI' : 'MANUAL'

const updatedConversation = await prisma.conversation.update({
  where: {
    id
  },
  data: {
    mode: newMode
  },
  include: {
    assignedUser: true,
    phoneNumber: true
  }
})

// 🔥 cancelar automação se virou manual
if (newMode === 'MANUAL') {
  try {
    await cancelConversationAutomation({
      conversationId: id,
      reason: 'manual_override'
    })
  } catch (error) {
    request.log.error(
      {
        error,
        conversationId: id
      },
      'Failed to cancel automation after manual override'
    )
  }
}

    let conversationForResponse = updatedConversation

if (newMode === 'MANUAL') {
  conversationForResponse = await prisma.conversation.findFirstOrThrow({
    where: {
      id,
      tenantId
    },
    include: {
      assignedUser: true,
      phoneNumber: true
    }
  })
} else {
  publish(tenantId, {
    type: 'conversation:mode_changed',
    payload: serializeConversationUpdate(updatedConversation)
  })
}

return serializeConversationUpdate(conversationForResponse)
  })

  app.patch('/conversations/:id/assign', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params)
    const parsedBody = updateConversationAssignmentSchema.safeParse(request.body)
    const session = await getSessionFromRequest(request)

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Invalid conversation id'
      })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const { id } = parsedParams.data
    const { userId, reason } = parsedBody.data
    const tenantId = session.user.tenantId
    const assignedByUserId = session.user.id
    const currentUserId = session.user.id
    const currentUserRole = session.user.role

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        tenantId
      },
      include: {
        assignedUser: true
      }
    })

    if (!conversation) {
      return reply.status(404).send({
        message: 'Conversation not found'
      })
    }

        const assignmentDecision = resolveAssignmentTarget({
      sessionUser: {
        id: currentUserId,
        tenantId,
        role: currentUserRole
      },
      conversation: {
        id: conversation.id,
        tenantId: conversation.tenantId,
        assignedUserId: conversation.assignedUserId,
        assignedUser: conversation.assignedUser
      },
      requestedUserId: userId ?? null
    })

    if (!assignmentDecision.ok) {
      return reply.status(assignmentDecision.status).send({
        message: assignmentDecision.message
      })
    }

    let targetUser:
  | {
      id: string
      name: string
      email: string
      tenantId: string
      role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
      isActive: boolean
      presenceStatus?: 'AVAILABLE' | 'PAUSED' | null
    }
  | null = null

        const requestedTargetUserId = assignmentDecision.targetUserId

    if (requestedTargetUserId) {
      targetUser = await prisma.user.findFirst({
        where: {
          id: requestedTargetUserId,
          tenantId,
          isActive: true
        },
        select: {
  id: true,
  name: true,
  email: true,
  tenantId: true,
  role: true,
  isActive: true,
  presenceStatus: true
}
      })

      if (!targetUser) {
        return reply.status(404).send({
          message: 'Target user not found'
        })
      }
      if (targetUser && !isUserEligibleForAssignment(targetUser)) {
  return reply.status(400).send({
    message: 'Target user is not eligible for assignment (inactive, paused or invalid role)'
  })
}
    }

    const assignedByUser = await prisma.user.findFirst({
      where: {
        id: assignedByUserId,
        tenantId
      },
      select: {
        id: true
      }
    })

    if (!assignedByUser) {
      return reply.status(404).send({
        message: 'assignedByUser not found'
      })
    }

    const now = new Date()

    const updatedConversation = await prisma.$transaction(async (tx) => {
      const activeAssignments = await tx.assignment.findMany({
        where: {
          conversationId: conversation.id,
          unassignedAt: null
        },
        select: {
          id: true
        }
      })

      if (activeAssignments.length > 0) {
        await tx.assignment.updateMany({
          where: {
            id: {
              in: activeAssignments.map((assignment) => assignment.id)
            }
          },
          data: {
            unassignedAt: now
          }
        })
      }

      const updated = await tx.conversation.update({
        where: {
          id: conversation.id
        },
        data: {
          assignedUserId: targetUser?.id ?? null,
          assignedAt: targetUser ? now : null,
          waitingSince: targetUser ? null : now
        },
        include: {
          assignedUser: true,
          phoneNumber: true
        }
      })

      if (targetUser) {
        await tx.assignment.create({
          data: {
            conversationId: conversation.id,
            userId: targetUser.id,
            assignedByUserId: assignedByUserId,
            assignedAt: now,
            reason
          }
        })
      }

      return updated
    })

    const response = serializeConversationUpdate(updatedConversation)

    publish(tenantId, {
      type: 'conversation:assigned',
      payload: response
    })

    return response
  })
    
  app.post('/conversations/:id/auto-assign', async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params)
    const session = await getSessionFromRequest(request)

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Invalid conversation id'
      })
    }

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const currentUserRole = session.user.role
    const tenantId = session.user.tenantId
    const { id } = parsedParams.data

    if (
      currentUserRole !== 'MASTER' &&
      currentUserRole !== 'ADMIN' &&
      currentUserRole !== 'MANAGER'
    ) {
      return reply.status(403).send({
        message: 'Sem permissão para auto distribuir conversa'
      })
    }

    try {
      const result = await autoAssignConversation({
        tenantId,
        conversationId: id,
        assignedByUserId: session.user.id,
        reason: 'Auto assignment manual test'
      })

      const conversation = await prisma.conversation.findFirst({
        where: {
          id,
          tenantId
        },
        include: {
          assignedUser: true,
          phoneNumber: true
        }
      })

      if (conversation) {
        const response = serializeConversationUpdate(conversation)

        publish(tenantId, {
          type: 'conversation:assigned',
          payload: response
        })

        return {
          ok: true,
          skipped: result.skipped,
          reason: result.reason,
          conversation: response
        }
      }

      return {
        ok: true,
        skipped: result.skipped,
        reason: result.reason
      }
    } catch (error) {
      return reply.status(500).send({
        message: error instanceof Error ? error.message : 'Erro ao auto distribuir conversa'
      })
    }
  })
}