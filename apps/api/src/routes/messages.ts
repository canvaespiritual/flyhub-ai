import { publish } from '../lib/realtime.js'
import { getSessionFromRequest } from '../lib/auth.js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { canOperateConversation } from '../lib/assignment-policy.js'
import {
  sendWhatsAppTextMessage,
  uploadWhatsAppMedia,
  sendWhatsAppMediaMessage
} from '../lib/whatsapp.js'
import { uploadBufferToStorage } from '../lib/storage.js'
import { convertAudioToOggOpus } from '../lib/audio-conversion.js'

const createMessageSchema = z.object({
  tenantId: z.string().min(1, 'tenantId é obrigatório').optional(),
  conversationId: z.string().min(1, 'conversationId é obrigatório'),
  senderUserId: z.string().min(1).optional(),
  type: z.enum(['text', 'audio', 'image', 'document', 'video', 'location']),
  content: z.string().optional()
})

type SupportedMessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'location'

type OutboundMediaType = 'audio' | 'image' | 'document' | 'video'

function mapMessageTypeToPrisma(type: SupportedMessageType) {
  return type.toUpperCase() as
    | 'TEXT'
    | 'AUDIO'
    | 'IMAGE'
    | 'DOCUMENT'
    | 'VIDEO'
    | 'LOCATION'
}

function mapMessageSenderTypeFromPrisma(
  senderType: 'LEAD' | 'AGENT' | 'AI' | 'SYSTEM'
) {
  return senderType.toLowerCase()
}

function mapMessageTypeFromPrisma(
  type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION'
) {
  switch (type) {
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
    case 'TEXT':
    default:
      return 'text'
  }
}

function mapMessageStatusFromPrisma(
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
) {
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

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getStoragePrefixByType(type: OutboundMediaType) {
  switch (type) {
    case 'audio':
      return 'media/audio'
    case 'image':
      return 'media/image'
    case 'document':
      return 'media/document'
    case 'video':
      return 'media/video'
  }
}

function getMaxFileSizeByType(type: OutboundMediaType) {
  switch (type) {
    case 'audio':
      return 16 * 1024 * 1024
    case 'image':
      return 20 * 1024 * 1024
    case 'document':
      return 20 * 1024 * 1024
    case 'video':
      return 50 * 1024 * 1024
  }
}

function detectMessageTypeFromMimeType(mimeType?: string | null): OutboundMediaType | null {
  if (!mimeType) return null

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'

  return 'document'
}

function validateMimeTypeForMessageType(type: OutboundMediaType, mimeType?: string | null) {
  if (!mimeType) return false

  switch (type) {
    case 'image':
      return mimeType.startsWith('image/')
    case 'audio':
      return mimeType.startsWith('audio/')
    case 'video':
      return mimeType.startsWith('video/')
    case 'document':
      return true
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

async function parseMultipartMessageRequest(request: any): Promise<{
  conversationId: string
  type: SupportedMessageType
  content?: string
  file?: {
    buffer: Buffer
    fileName: string
    mimeType: string
    size: number
  }
}> {
  const parts = request.parts()

  let conversationId = ''
  let type: SupportedMessageType | '' = ''
  let content: string | undefined
  let file:
    | {
        buffer: Buffer
        fileName: string
        mimeType: string
        size: number
      }
    | undefined

  for await (const part of parts) {
    if (part.type === 'file') {
      const buffer = await streamToBuffer(part.file)

      file = {
        buffer,
        fileName: part.filename || 'arquivo',
        mimeType: part.mimetype || 'application/octet-stream',
        size: buffer.length
      }

      continue
    }

    if (part.fieldname === 'conversationId') {
      conversationId = String(part.value ?? '')
      continue
    }

    if (part.fieldname === 'type') {
      type = String(part.value ?? '') as SupportedMessageType
      continue
    }

    if (part.fieldname === 'content') {
      const rawValue = String(part.value ?? '').trim()
      content = rawValue ? rawValue : undefined
    }
  }

  const parsed = createMessageSchema.safeParse({
    conversationId,
    type,
    content
  })

  if (!parsed.success) {
    throw new Error(
      JSON.stringify({
        message: 'Dados inválidos',
        issues: parsed.error.flatten()
      })
    )
  }

  return {
    conversationId: parsed.data.conversationId,
    type: parsed.data.type,
    content: parsed.data.content,
    file
  }
}

function buildMessageResponse(message: {
  id: string
  conversationId: string
  senderType: 'LEAD' | 'AGENT' | 'AI' | 'SYSTEM'
  direction: 'INBOUND' | 'OUTBOUND'
  type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION'
  content: string | null
  mediaUrl: string | null
  mimeType: string | null
  fileName: string | null
  durationSeconds: number | null
  latitude: number | null
  longitude: number | null
  locationName: string | null
  locationAddress: string | null
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  createdAt: Date
}) {
  return {
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
    latitude: message.latitude ?? undefined,
    longitude: message.longitude ?? undefined,
    locationName: message.locationName ?? undefined,
    locationAddress: message.locationAddress ?? undefined,
    status: mapMessageStatusFromPrisma(message.status),
    createdAt: message.createdAt.toISOString()
  }
}

export async function messageRoutes(app: FastifyInstance) {
  app.post('/messages', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    let conversationId = ''
    let type: SupportedMessageType = 'text'
    let content: string | undefined
    let uploadFile:
      | {
          buffer: Buffer
          fileName: string
          mimeType: string
          size: number
        }
      | undefined

    if ((request as any).isMultipart?.()) {
      try {
        const multipartData = await parseMultipartMessageRequest(request)

        conversationId = multipartData.conversationId
        type = multipartData.type
        content = multipartData.content
        uploadFile = multipartData.file
      } catch (error) {
        try {
          const parsedError = JSON.parse((error as Error).message)
          return reply.status(400).send(parsedError)
        } catch {
          return reply.status(400).send({
            message: 'Dados inválidos no multipart'
          })
        }
      }
    } else {
      const parsed = createMessageSchema.safeParse(request.body)

      if (!parsed.success) {
        return reply.status(400).send({
          message: 'Dados inválidos',
          issues: parsed.error.flatten()
        })
      }

      conversationId = parsed.data.conversationId
      type = parsed.data.type
      content = parsed.data.content
    }

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

    if (type === 'location') {
      return reply.status(400).send({
        message: 'Location outbound is not supported yet'
      })
    }

    if (type === 'text' && (!content || !content.trim())) {
      return reply.status(400).send({
        message: 'Text message cannot be empty'
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

    const now = new Date()

    if (type === 'text') {
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
            externalStatus: 'sent',
            sentAt: now
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

      const response = buildMessageResponse(message)

      publish(tenantId, {
        type: 'message:new',
        payload: response
      })

      return response
    }

    const mediaType = type as OutboundMediaType

if (!uploadFile) {
  return reply.status(400).send({
    message: 'File is required for media messages'
  })
}

let correctedMimeType = uploadFile.mimeType

if (mediaType === 'audio') {
  if (uploadFile.fileName?.toLowerCase().endsWith('.ogg')) {
    correctedMimeType = 'audio/ogg'
  } else if (uploadFile.fileName?.toLowerCase().endsWith('.mp3')) {
    correctedMimeType = 'audio/mpeg'
  } else if (uploadFile.fileName?.toLowerCase().endsWith('.m4a')) {
    correctedMimeType = 'audio/mp4'
  }
}

let correctedFileName = uploadFile.fileName || `${mediaType}_${Date.now()}`

if (mediaType === 'audio') {
  if (correctedMimeType === 'audio/ogg') {
    correctedFileName = correctedFileName.replace(/\.[^.]+$/i, '') + '.ogg'
  } else if (correctedMimeType === 'audio/mpeg') {
    correctedFileName = correctedFileName.replace(/\.[^.]+$/i, '') + '.mp3'
  } else if (correctedMimeType === 'audio/mp4') {
    correctedFileName = correctedFileName.replace(/\.[^.]+$/i, '') + '.m4a'
  }
}

let processedBuffer = uploadFile.buffer
let processedMimeType = correctedMimeType
let processedFileName = correctedFileName

if (mediaType === 'audio') {
  try {
    const converted = await convertAudioToOggOpus({
      inputBuffer: uploadFile.buffer
    })

    processedBuffer = converted.buffer
    processedMimeType = converted.mimeType
    processedFileName =
      correctedFileName.replace(/\.[^.]+$/i, '') +
      '.' +
      converted.fileExtension

    console.log('[AUDIO_CONVERTED]', {
      originalMime: uploadFile.mimeType,
      finalMime: processedMimeType,
      finalFileName: processedFileName,
      sizeBefore: uploadFile.buffer.length,
      sizeAfter: processedBuffer.length
    })
  } catch (err) {
    console.error('[AUDIO_CONVERSION_FAILED]', err)
    return reply.status(500).send({
      message: 'Audio conversion failed'
    })
  }
}

console.log('[MEDIA_MESSAGE_RECEIVED]', {
  conversationId,
  tenantId,
  mediaType,
  fileName: processedFileName,
  originalFileName: uploadFile.fileName,
  mimeType: processedMimeType,
  originalMimeType: uploadFile.mimeType,
  size: uploadFile.size,
  content
})

if (!validateMimeTypeForMessageType(mediaType, processedMimeType)) {
  return reply.status(400).send({
    message: `Invalid mime type for ${mediaType}: ${processedMimeType}`
  })
}

const detectedType = detectMessageTypeFromMimeType(processedMimeType)

if (!detectedType || detectedType !== mediaType) {
  return reply.status(400).send({
    message: `Uploaded file does not match declared type "${mediaType}"`
  })
}

    const maxFileSize = getMaxFileSizeByType(mediaType)

    if (uploadFile.size > maxFileSize) {
      return reply.status(400).send({
        message: `File exceeds limit for ${mediaType}. Max allowed: ${maxFileSize} bytes`
      })
    }

       const safeFileName = sanitizeFileName(processedFileName)
const storageKey = `${getStoragePrefixByType(mediaType)}/${tenantId}/${conversationId}/${Date.now()}-${safeFileName}`

const storageUpload = await uploadBufferToStorage({
  key: storageKey,
  body: processedBuffer,
  contentType: processedMimeType
})

        console.log('[MEDIA_STORAGE_UPLOAD_DONE]', {
      conversationId,
      storageKey: storageUpload.key,
      mediaUrl: storageUpload.url
    })

    const mediaUploadResponse = await uploadWhatsAppMedia({
  phoneNumberId: conversation.phoneNumber.externalId,
  fileBuffer: processedBuffer,
  mimeType: processedMimeType,
  fileName: processedFileName
})

        console.log('[MEDIA_META_UPLOAD_DONE]', {
      conversationId,
      externalMediaId: mediaUploadResponse.id
    })

    const waResponse = await sendWhatsAppMediaMessage({
      phoneNumberId: conversation.phoneNumber.externalId,
      to: conversation.contact.phone,
      type: mediaType,
      mediaId: mediaUploadResponse.id,
      caption:
        mediaType === 'image' || mediaType === 'video' || mediaType === 'document'
          ? content?.trim()
          : undefined,
      fileName: mediaType === 'document' ? safeFileName : undefined
    })
    console.log('[MEDIA_META_SEND_DONE]', {
      conversationId,
      waResponse
    })
        const externalMessageId = waResponse.messages?.[0]?.id ?? null

    if (!externalMessageId) {
      console.error('[MEDIA_META_SEND_NO_MESSAGE_ID]', {
        conversationId,
        waResponse
      })

      return reply.status(502).send({
        message: 'WhatsApp did not return a message id for this media send'
      })
    }
    const message = await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.message.create({
        data: {
          conversationId,
          senderUserId,
          senderType: 'AGENT',
          direction: 'OUTBOUND',
          type: mapMessageTypeToPrisma(mediaType),
          status: 'SENT',
          provider: conversation.phoneNumber.provider,
          content: content ?? '',
          mediaUrl: storageUpload.url,
          storageKey: storageUpload.key,
          mimeType: processedMimeType,
          fileName: safeFileName,
          externalMediaId: mediaUploadResponse.id,
          externalMessageId,
          externalStatus: 'sent',
          sentAt: now
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

    const response = buildMessageResponse(message)

    publish(tenantId, {
      type: 'message:new',
      payload: response
    })

    return response
  })
}