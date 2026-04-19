import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { publish } from '../lib/realtime.js'
import { autoAssignConversation } from '../lib/auto-assignment.js'
import {
  markWhatsAppMessageAsRead,
  getWhatsAppMediaMetadata,
  downloadWhatsAppMediaFile
} from '../lib/whatsapp.js'
import {
  isStorageConfigured,
  uploadBufferToStorage
} from '../lib/storage.js'

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
          audio?: {
            id?: string
            mime_type?: string
            voice?: boolean
          }
          image?: {
            id?: string
            mime_type?: string
            sha256?: string
            caption?: string
          }
          document?: {
            id?: string
            mime_type?: string
            sha256?: string
            filename?: string
            caption?: string
          }
          video?: {
            id?: string
            mime_type?: string
            sha256?: string
            caption?: string
            filename?: string
          }
          location?: {
            latitude?: number | string
            longitude?: number | string
            name?: string
            address?: string
            url?: string
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
                    errors?: Array<{
            code?: number
            title?: string
            message?: string
            error_data?: {
              details?: string
            }
          }>
        }>
      }
    }>
  }>
}

const MAX_AUDIO_BYTES = 16 * 1024 * 1024
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

function normalizePhone(value?: string | null) {
  if (!value) return null

  let phone = value.replace(/\D/g, '')

  if (phone.startsWith('55') && phone.length === 12) {
    phone = phone.slice(0, 4) + '9' + phone.slice(4)
  }

  return phone
}

function mapInboundMessageType(
  type?: string
): 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION' {
  switch (type) {
    case 'audio':
      return 'AUDIO'
    case 'image':
      return 'IMAGE'
    case 'document':
      return 'DOCUMENT'
    case 'video':
      return 'VIDEO'
    case 'location':
      return 'LOCATION'
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
    latitude: message.latitude ?? undefined,
    longitude: message.longitude ?? undefined,
    locationName: message.locationName ?? undefined,
    locationAddress: message.locationAddress ?? undefined,
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

  return (
    STATUS_ORDER[incoming as keyof typeof STATUS_ORDER] >
    STATUS_ORDER[current as keyof typeof STATUS_ORDER]
  )
}

function getExtensionFromMimeType(mimeType?: string | null) {
  if (!mimeType) return 'bin'

  const normalized = mimeType.toLowerCase()

  if (normalized === 'audio/ogg') return 'ogg'
  if (normalized === 'audio/opus') return 'opus'
  if (normalized === 'audio/mpeg') return 'mp3'
  if (normalized === 'audio/mp4') return 'm4a'
  if (normalized === 'image/jpeg') return 'jpg'
  if (normalized === 'image/png') return 'png'
  if (normalized === 'image/webp') return 'webp'
  if (normalized === 'application/pdf') return 'pdf'
  if (normalized === 'video/mp4') return 'mp4'
  if (normalized === 'video/quicktime') return 'mov'
  if (normalized === 'video/webm') return 'webm'

  const parts = normalized.split('/')
  return parts[1]?.split(';')[0] || 'bin'
}

function getLocationContent(location?: {
  name?: string
  address?: string
  latitude?: number | string
  longitude?: number | string
}) {
  const name = location?.name?.trim()
  const address = location?.address?.trim()

  if (name && address) {
    return `${name} - ${address}`
  }

  if (name) return name
  if (address) return address

  if (
    location?.latitude !== undefined &&
    location?.longitude !== undefined
  ) {
    return `[location] ${location.latitude}, ${location.longitude}`
  }

  return '[location]'
}

function getMediaPrefix(type: 'audio' | 'image' | 'document' | 'video') {
  if (type === 'audio') return 'media/audio'
  if (type === 'image') return 'media/image'
  if (type === 'document') return 'media/document'
  return 'media/video'
}

function getMediaSizeLimit(type: 'audio' | 'image' | 'document' | 'video') {
  if (type === 'audio') return MAX_AUDIO_BYTES
  if (type === 'image') return MAX_IMAGE_BYTES
  if (type === 'document') return MAX_DOCUMENT_BYTES
  return MAX_VIDEO_BYTES
}

function getTooLargeFallback(type: 'audio' | 'image' | 'document' | 'video') {
  if (type === 'audio') return '[audio too large]'
  if (type === 'image') return '[image too large]'
  if (type === 'document') return '[document too large]'
  return '[video too large]'
}

function getInboundMediaData(inbound: {
  type?: string
  text?: { body?: string }
  audio?: { id?: string; mime_type?: string }
  image?: { id?: string; mime_type?: string; caption?: string }
  document?: {
    id?: string
    mime_type?: string
    filename?: string
    caption?: string
  }
  video?: {
    id?: string
    mime_type?: string
    caption?: string
    filename?: string
  }
  location?: {
    latitude?: number | string
    longitude?: number | string
    name?: string
    address?: string
    url?: string
  }
}) {
  if (inbound.type === 'audio') {
    return {
      kind: 'audio' as const,
      providerMediaId: inbound.audio?.id ?? null,
      mimeType: inbound.audio?.mime_type ?? null,
      fileName: null,
      fallbackContent: '[audio]'
    }
  }

  if (inbound.type === 'image') {
    return {
      kind: 'image' as const,
      providerMediaId: inbound.image?.id ?? null,
      mimeType: inbound.image?.mime_type ?? null,
      fileName: null,
      fallbackContent: inbound.image?.caption?.trim() || '[image]'
    }
  }

  if (inbound.type === 'document') {
    return {
      kind: 'document' as const,
      providerMediaId: inbound.document?.id ?? null,
      mimeType: inbound.document?.mime_type ?? null,
      fileName: inbound.document?.filename ?? null,
      fallbackContent: inbound.document?.caption?.trim() || '[document]'
    }
  }

  if (inbound.type === 'video') {
    return {
      kind: 'video' as const,
      providerMediaId: inbound.video?.id ?? null,
      mimeType: inbound.video?.mime_type ?? null,
      fileName: inbound.video?.filename ?? null,
      fallbackContent: inbound.video?.caption?.trim() || '[video]'
    }
  }

  if (inbound.type === 'location') {
    return {
      kind: 'location' as const,
      providerMediaId: null,
      mimeType: null,
      fileName: null,
      fallbackContent: getLocationContent(inbound.location)
    }
  }

  return {
    kind: 'text' as const,
    providerMediaId: null,
    mimeType: null,
    fileName: null,
    fallbackContent: inbound.text?.body?.trim() || '[message]'
  }
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

          for (const statusEvent of value.statuses ?? []) {
            const externalMessageId = statusEvent.id
            const mappedStatus = mapMetaStatusToPrisma(statusEvent.status)

            if (!externalMessageId || !mappedStatus) continue
            
            console.log('[WHATSAPP_STATUS_EVENT]', {
  externalMessageId,
  status: statusEvent.status
})
            if (statusEvent.status === 'failed') {
              console.error('[WHATSAPP_STATUS_FAILED_DETAILS]', {
                externalMessageId,
                status: statusEvent.status,
                recipientId: statusEvent.recipient_id,
                errors: statusEvent.errors
              })
            }
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
            const media = getInboundMediaData(inbound)

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

            const baseData = await prisma.$transaction(async (tx) => {
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
                    status:
                      conversation.status === 'CLOSED'
                        ? 'OPEN'
                        : conversation.status,
                    waitingSince: conversation.assignedUserId
                      ? conversation.waitingSince
                      : inboundAt,
                    lastMessageAt: inboundAt,
                    lastInboundAt: inboundAt
                  },
                  include: {
                    assignedUser: true,
                    phoneNumber: true
                  }
                })
              }

              return {
                conversation
              }
            })

            let uploadedMediaUrl: string | null = null
            let uploadedStorageKey: string | null = null
            let resolvedMimeType = media.mimeType
            let resolvedFileName = media.fileName
            let finalContent = inboundText || media.fallbackContent

            const latitude =
              inbound.type === 'location' && inbound.location?.latitude !== undefined
                ? Number(inbound.location.latitude)
                : null

            const longitude =
              inbound.type === 'location' && inbound.location?.longitude !== undefined
                ? Number(inbound.location.longitude)
                : null

            const locationName =
              inbound.type === 'location'
                ? inbound.location?.name?.trim() || null
                : null

            const locationAddress =
              inbound.type === 'location'
                ? inbound.location?.address?.trim() || null
                : null

            if (media.providerMediaId && isStorageConfigured()) {

              try {
                const mediaMetadata = await getWhatsAppMediaMetadata(
                  media.providerMediaId
                )

                const resolvedSize = Number(mediaMetadata.file_size ?? 0)
                const limit = getMediaSizeLimit(media.kind)

                if (resolvedSize > 0 && resolvedSize > limit) {
                  request.log.warn(
                    {
                      inboundExternalId,
                      kind: media.kind,
                      fileSize: resolvedSize,
                      limit
                    },
                    'Inbound WhatsApp media exceeded configured size limit'
                  )

                  finalContent = getTooLargeFallback(media.kind)
                } else {
                  const fileBuffer = await downloadWhatsAppMediaFile(
                    mediaMetadata.url
                  )

                  resolvedMimeType =
                    resolvedMimeType || mediaMetadata.mime_type || null

                  const extension = getExtensionFromMimeType(resolvedMimeType)
                  const storagePrefix = getMediaPrefix(media.kind)

                  const storageKey = [
                    storagePrefix,
                    tenantId,
                    baseData.conversation.id,
                    inboundExternalId,
                    `media.${extension}`
                  ].join('/')

                  const upload = await uploadBufferToStorage({
                    key: storageKey,
                    body: fileBuffer,
                    contentType: resolvedMimeType ?? undefined
                  })

                  uploadedMediaUrl = upload.url
                  uploadedStorageKey = upload.key

                  if (!resolvedFileName && media.kind === 'document') {
                    resolvedFileName = `document.${extension}`
                  }

                  if (!resolvedFileName && media.kind === 'video') {
                    resolvedFileName = `video.${extension}`
                  }
                }
              } catch (error) {
                request.log.error(
                  {
                    error,
                    inboundExternalId,
                    providerMediaId: media.providerMediaId,
                    kind: media.kind
                  },
                  'Failed to fetch/upload WhatsApp inbound media'
                )
              }
            }

            const createdMessage = await prisma.message.create({
              data: {
                conversationId: baseData.conversation.id,
                senderType: 'LEAD',
                direction: 'INBOUND',
                type: mapInboundMessageType(inbound.type),
                status: 'DELIVERED',
                provider: 'WHATSAPP_CLOUD',
                externalMessageId: inboundExternalId,
                externalStatus: 'received',
                externalMediaId: media.providerMediaId,
                content: finalContent,
                mediaUrl: uploadedMediaUrl,
                storageKey: uploadedStorageKey,
                mimeType: resolvedMimeType,
                fileName: resolvedFileName,
                latitude: Number.isFinite(latitude) ? latitude : null,
                longitude: Number.isFinite(longitude) ? longitude : null,
                locationName,
                locationAddress
              }
            })

            publish(tenantId, {
              type: 'message:new',
              payload: mapRealtimeMessage(createdMessage)
            })

            if (!baseData.conversation.assignedUserId) {
              try {
                const autoAssignResult = await autoAssignConversation({
                  tenantId,
                  conversationId: baseData.conversation.id,
                  reason: 'Inbound WhatsApp message'
                })

                if (!autoAssignResult.skipped && autoAssignResult.conversation) {
                  publish(tenantId, {
                    type: 'conversation:assigned',
                    payload: {
                      id: autoAssignResult.conversation.id,
                      mode:
                        autoAssignResult.conversation.mode === 'AI'
                          ? 'ai'
                          : 'manual',
                      status:
                        autoAssignResult.conversation.status === 'OPEN'
                          ? 'open'
                          : autoAssignResult.conversation.status === 'PENDING'
                            ? 'pending'
                            : 'closed',
                      updatedAt:
                        autoAssignResult.conversation.updatedAt.toISOString(),
                      assignedAt:
                        autoAssignResult.conversation.assignedAt?.toISOString(),
                      waitingSince:
                        autoAssignResult.conversation.waitingSince?.toISOString(),
                      firstResponseAt:
                        autoAssignResult.conversation.firstResponseAt?.toISOString(),
                      closedAt:
                        autoAssignResult.conversation.closedAt?.toISOString(),
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
                            email:
                              autoAssignResult.conversation.assignedUser.email,
                            role:
                              autoAssignResult.conversation.assignedUser.role?.toLowerCase() ??
                              'agent'
                          }
                        : null,
                      phoneNumber: {
                        id: autoAssignResult.conversation.phoneNumber.id,
                        number: autoAssignResult.conversation.phoneNumber.number,
                        label:
                          autoAssignResult.conversation.phoneNumber.label ??
                          undefined
                      }
                    }
                  })
                }
              } catch (error) {
                request.log.error(
                  { error, conversationId: baseData.conversation.id },
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