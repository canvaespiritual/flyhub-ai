import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { publish } from '../lib/realtime.js'
import { autoAssignConversation } from '../lib/auto-assignment.js'
import { markWhatsAppMessageAsRead } from '../lib/whatsapp.js'

type WhatsAppWebhookPayload = {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: {
        messaging_product?: string
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        contacts?: Array<{
          profile?: {
            name?: string
          }
          wa_id?: string
        }>
        messages?: Array<{
          id?: string
          from?: string
          timestamp?: string
          type?: string
          text?: {
            body?: string
          }
        }>
        statuses?: Array<{
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
  conversation?: {
    id?: string
    expiration_timestamp?: string
    origin?: {
      type?: string
    }
  }
  pricing?: {
    billable?: boolean
    pricing_model?: string
    category?: string
  }
}>
      }
    }>
  }>
}

function normalizePhone(value?: string | null) {
  if (!value) return null

  let phone = value.replace(/\D/g, '')

  // regra Brasil
  if (phone.startsWith('55') && phone.length === 12) {
    // 55 + DDD (2) + número (8) → inserir 9
    phone = phone.slice(0, 4) + '9' + phone.slice(4)
  }

  return phone
}

function mapInboundMessageType(
  type?: string
): 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' {
  switch (type) {
    case 'audio':
      return 'AUDIO'
    case 'image':
      return 'IMAGE'
    case 'document':
      return 'DOCUMENT'
    case 'text':
    default:
      return 'TEXT'
  }
}

function mapRealtimeMessage(message: {
  id: string
  conversationId: string
  senderType: 'LEAD' | 'AGENT' | 'AI' | 'SYSTEM'
  direction: 'INBOUND' | 'OUTBOUND'
  type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT'
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  content: string | null
  mediaUrl: string | null
  mimeType: string | null
  fileName: string | null
  durationSeconds: number | null
  createdAt: Date
}) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderType: message.senderType.toLowerCase(),
    direction: message.direction.toLowerCase(),
    type: message.type.toLowerCase(),
    content: message.content ?? '',
    mediaUrl: message.mediaUrl ?? undefined,
    mimeType: message.mimeType ?? undefined,
    fileName: message.fileName ?? undefined,
    durationSeconds: message.durationSeconds ?? undefined,
    status: message.status.toLowerCase(),
    createdAt: message.createdAt.toISOString()
  }
}
const STATUS_ORDER = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: -1
} as const

function mapMetaStatusToPrisma(status?: string) {
  if (status === 'sent') return 'SENT'
  if (status === 'delivered') return 'DELIVERED'
  if (status === 'read') return 'READ'
  if (status === 'failed') return 'FAILED'
  return null
}

function shouldUpdateStatus(current: string, incoming: string) {
  if (incoming === 'FAILED') return true

  return STATUS_ORDER[incoming as keyof typeof STATUS_ORDER] >
    STATUS_ORDER[current as keyof typeof STATUS_ORDER]
}
export async function whatsappWebhookRoutes(app: FastifyInstance) {
  app.get('/webhooks/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>

    const mode = query['hub.mode']
    const token = query['hub.verify_token']
    const challenge = query['hub.challenge']

    if (mode !== 'subscribe') {
      return reply.status(400).send('Invalid hub.mode')
    }

    if (!challenge) {
      return reply.status(400).send('Missing hub.challenge')
    }

    if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      request.log.error('WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured')
      return reply.status(500).send('Webhook verify token not configured')
    }

    if (token !== process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      return reply.status(403).send('Invalid verify token')
    }

    return reply.status(200).send(challenge)
  })

  app.post('/webhooks/whatsapp', async (request, reply) => {
    const body = request.body as WhatsAppWebhookPayload

    if (body?.object !== 'whatsapp_business_account') {
      return reply.status(200).send({ ok: true, ignored: 'unsupported_object' })
    }

    try {
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== 'messages') continue

          const value = change.value
          if (!value) continue

          const phoneNumberId = value.metadata?.phone_number_id
          const displayPhoneNumber = value.metadata?.display_phone_number

          const phoneNumber = await prisma.phoneNumber.findFirst({
            where: {
              provider: 'WHATSAPP_CLOUD',
              isActive: true,
              OR: [
                ...(phoneNumberId ? [{ externalId: phoneNumberId }] : []),
                ...(displayPhoneNumber
                  ? [{ number: normalizePhone(displayPhoneNumber) ?? undefined }]
                  : [])
              ].filter(Boolean) as Array<Record<string, unknown>>
            }
          })

          if (!phoneNumber) {
            request.log.warn(
              {
                phoneNumberId,
                displayPhoneNumber
              },
              'WhatsApp webhook received for unknown phone number'
            )
            continue
          }

          const tenantId = phoneNumber.tenantId
// 🔥 PROCESSAR STATUS DA META
for (const statusEvent of value.statuses ?? []) {
  const externalMessageId = statusEvent.id
  const mappedStatus = mapMetaStatusToPrisma(statusEvent.status)

  if (!externalMessageId || !mappedStatus) continue

  const existingMessage = await prisma.message.findFirst({
    where: {
      provider: 'WHATSAPP_CLOUD',
      externalMessageId
    }
  })

  if (!existingMessage) {
    request.log.warn(
      { externalMessageId },
      'Status recebido sem mensagem correspondente'
    )
    continue
  }

  if (!shouldUpdateStatus(existingMessage.status, mappedStatus)) {
    request.log.info(
      {
        externalMessageId,
        current: existingMessage.status,
        incoming: mappedStatus
      },
      'Status ignorado (duplicado ou regressão)'
    )
    continue
  }

  await prisma.message.update({
    where: { id: existingMessage.id },
    data: {
      status: mappedStatus,
      externalStatus: statusEvent.status
    }
  })

  publish(tenantId, {
    type: 'message:new',
    payload: mapRealtimeMessage({
      ...existingMessage,
      status: mappedStatus
    })
  })
}
          for (const inbound of value.messages ?? []) {
            const inboundExternalId = inbound.id
            const inboundFrom = normalizePhone(inbound.from)
            const inboundProfileName = value.contacts?.[0]?.profile?.name?.trim()
            const inboundText = inbound.text?.body?.trim() ?? ''

            if (!inboundExternalId || !inboundFrom) {
  continue
}

const existingMessage = await prisma.message.findFirst({
  where: {
    provider: 'WHATSAPP_CLOUD',
    externalMessageId: inboundExternalId
  },
  select: {
    id: true
  }
})

if (existingMessage) {
  continue
}

// 🔥 só marca como lido se for mensagem nova
if (phoneNumber.externalId) {
  await markWhatsAppMessageAsRead({
    phoneNumberId: phoneNumber.externalId,
    messageId: inboundExternalId
  })
}

            const timestampMs = inbound.timestamp
              ? Number(inbound.timestamp) * 1000
              : Date.now()
            const inboundAt = new Date(
              Number.isFinite(timestampMs) ? timestampMs : Date.now()
            )

            const result = await prisma.$transaction(async (tx) => {
              const contact = await tx.contact.upsert({
                where: {
                  tenantId_phone: {
                    tenantId,
                    phone: inboundFrom
                  }
                },
                update: {
                  name: inboundProfileName || inboundFrom,
                  phoneRaw: inbound.from ?? inboundFrom
                },
                create: {
                  tenantId,
                  name: inboundProfileName || inboundFrom,
                  phone: inboundFrom,
                  phoneRaw: inbound.from ?? inboundFrom
                }
              })

              let conversation = await tx.conversation.findFirst({
                where: {
                  tenantId,
                  contactId: contact.id,
                  phoneNumberId: phoneNumber.id,
                  status: {
                    in: ['OPEN', 'PENDING']
                  }
                },
                orderBy: {
                  updatedAt: 'desc'
                },
                include: {
                  assignedUser: true,
                  phoneNumber: true
                }
              })

              if (!conversation) {
                conversation = await tx.conversation.create({
                  data: {
                    tenantId,
                    contactId: contact.id,
                    phoneNumberId: phoneNumber.id,
                    channel: 'WHATSAPP',
                    mode: 'MANUAL',
                    status: 'OPEN',
                    priority: 'NORMAL',
                    waitingSince: inboundAt,
                    lastMessageAt: inboundAt,
                    lastInboundAt: inboundAt
                  },
                  include: {
                    assignedUser: true,
                    phoneNumber: true
                  }
                })
              } else {
                conversation = await tx.conversation.update({
                  where: {
                    id: conversation.id
                  },
                  data: {
                    status: conversation.status === 'CLOSED' ? 'OPEN' : conversation.status,
                    waitingSince: conversation.assignedUserId ? conversation.waitingSince : inboundAt,
                    lastMessageAt: inboundAt,
                    lastInboundAt: inboundAt
                  },
                  include: {
                    assignedUser: true,
                    phoneNumber: true
                  }
                })
              }

              const createdMessage = await tx.message.create({
                data: {
                  conversationId: conversation.id,
                  senderType: 'LEAD',
                  direction: 'INBOUND',
                  type: mapInboundMessageType(inbound.type),
                  status: 'DELIVERED',
                  provider: 'WHATSAPP_CLOUD',
                  externalMessageId: inboundExternalId,
                  externalStatus: 'received',
                  content: inboundText || `[${inbound.type}]`
                }
              })

              return {
                conversation,
                message: createdMessage
              }
            })

            publish(tenantId, {
              type: 'message:new',
              payload: mapRealtimeMessage(result.message)
            })

            if (!result.conversation.assignedUserId) {
              try {
                const autoAssignResult = await autoAssignConversation({
                  tenantId,
                  conversationId: result.conversation.id,
                  reason: 'Inbound WhatsApp message'
                })

                if (!autoAssignResult.skipped && autoAssignResult.conversation) {
                  publish(tenantId, {
                    type: 'conversation:assigned',
                    payload: {
                      id: autoAssignResult.conversation.id,
                      mode: autoAssignResult.conversation.mode === 'AI' ? 'ai' : 'manual',
                      status:
                        autoAssignResult.conversation.status === 'OPEN'
                          ? 'open'
                          : autoAssignResult.conversation.status === 'PENDING'
                            ? 'pending'
                            : 'closed',
                      updatedAt: autoAssignResult.conversation.updatedAt.toISOString(),
                      assignedAt: autoAssignResult.conversation.assignedAt?.toISOString(),
                      waitingSince: autoAssignResult.conversation.waitingSince?.toISOString(),
                      firstResponseAt:
                        autoAssignResult.conversation.firstResponseAt?.toISOString(),
                      closedAt: autoAssignResult.conversation.closedAt?.toISOString(),
                      priority:
                        autoAssignResult.conversation.priority === 'LOW'
                          ? 'low'
                          : autoAssignResult.conversation.priority === 'HIGH'
                            ? 'high'
                            : 'normal',
                      subject: autoAssignResult.conversation.subject ?? undefined,
                      metaThreadId:
                        autoAssignResult.conversation.metaThreadId ?? undefined,
                      assignedUser: autoAssignResult.conversation.assignedUser
                        ? {
                            id: autoAssignResult.conversation.assignedUser.id,
                            name: autoAssignResult.conversation.assignedUser.name,
                            email: autoAssignResult.conversation.assignedUser.email,
                            role:
                              autoAssignResult.conversation.assignedUser.role?.toLowerCase() ??
                              'agent'
                          }
                        : null,
                      phoneNumber: {
                        id: autoAssignResult.conversation.phoneNumber.id,
                        number: autoAssignResult.conversation.phoneNumber.number,
                        label:
                          autoAssignResult.conversation.phoneNumber.label ?? undefined
                      }
                    }
                  })
                }
              } catch (error) {
                request.log.error(
                  { error, conversationId: result.conversation.id },
                  'Failed to auto assign inbound WhatsApp conversation'
                )
              }
            }
          }
        }
      }

      return reply.status(200).send({ ok: true })
    } catch (error) {
      request.log.error({ error }, 'Error processing WhatsApp webhook')
      return reply.status(500).send({ ok: false })
    }
  })
}