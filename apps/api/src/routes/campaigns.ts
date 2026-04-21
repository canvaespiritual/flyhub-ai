import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'
import { uploadBufferToStorage } from '../lib/storage.js'
import { convertAudioToOggOpus } from '../lib/audio-conversion.js'

const campaignParamsSchema = z.object({
  id: z.string().min(1)
})

const uploadCampaignMediaBodySchema = z.object({
  type: z.enum(['audio', 'image', 'document', 'video'])
})

type UploadCampaignMediaType = 'audio' | 'image' | 'document' | 'video'

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getStoragePrefixByCampaignStepType(type: UploadCampaignMediaType) {
  switch (type) {
    case 'audio':
      return 'campaign-steps/audio'
    case 'image':
      return 'campaign-steps/image'
    case 'document':
      return 'campaign-steps/document'
    case 'video':
      return 'campaign-steps/video'
  }
}

function getMaxFileSizeByCampaignStepType(type: UploadCampaignMediaType) {
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

function validateMimeTypeForCampaignStepType(
  type: UploadCampaignMediaType,
  mimeType?: string | null
) {
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

function detectCampaignStepTypeFromMimeType(
  mimeType?: string | null
): UploadCampaignMediaType | null {
  if (!mimeType) return null

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'

  return 'document'
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

async function parseCampaignMediaUploadRequest(request: any): Promise<{
  type: UploadCampaignMediaType
  file: {
    buffer: Buffer
    fileName: string
    mimeType: string
    size: number
  }
}> {
  const parts = request.parts()

  let type: UploadCampaignMediaType | '' = ''
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

    if (part.fieldname === 'type') {
      type = String(part.value ?? '') as UploadCampaignMediaType
    }
  }

  const parsed = uploadCampaignMediaBodySchema.safeParse({ type })

  if (!parsed.success) {
    throw new Error(
      JSON.stringify({
        message: 'Dados inválidos',
        issues: parsed.error.flatten()
      })
    )
  }

  if (!file) {
    throw new Error(
      JSON.stringify({
        message: 'Arquivo é obrigatório'
      })
    )
  }

  return {
    type: parsed.data.type,
    file
  }
}
const campaignInitialStepInputSchema = z
  .object({
    order: z.coerce.number().int().min(1).max(999),
    type: z.enum(['text', 'audio', 'image', 'document', 'video', 'link']),
    content: z.string().trim().max(5000).optional().nullable(),
    mediaUrl: z.string().trim().max(5000).optional().nullable(),
    storageKey: z.string().trim().max(1000).optional().nullable(),
    mimeType: z.string().trim().max(255).optional().nullable(),
    fileName: z.string().trim().max(255).optional().nullable(),
    delaySeconds: z.coerce.number().int().min(0).max(86400).default(0),
    isActive: z.boolean().optional().default(true)
  })
  .superRefine((step, ctx) => {
    const needsTextContent = step.type === 'text' || step.type === 'link'
    const hasTextContent = Boolean(step.content?.trim())
    const hasMedia = Boolean(step.mediaUrl?.trim())

    if (needsTextContent && !hasTextContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Texto e link precisam de conteúdo',
        path: ['content']
      })
    }

    if (!needsTextContent && !hasMedia) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Áudio, imagem, documento e vídeo precisam de mídia anexada',
        path: ['mediaUrl']
      })
    }
  })

function hasDuplicateOrders(steps?: Array<{ order: number }>) {
  if (!steps?.length) return false
  const orders = steps.map((step) => step.order)
  return new Set(orders).size !== orders.length
}

const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phoneNumberId: z.string().min(1),
    managerId: z.string().min(1).nullable().optional(),
    metaAdId: z.string().trim().min(1).max(100).nullable().optional(),
    ref: z.string().trim().min(1).max(100).nullable().optional(),
    fallbackText: z.string().trim().min(1).max(300).nullable().optional(),
    initialPrompt: z.string().trim().min(1).max(5000).nullable().optional(),
    isActive: z.boolean().optional(),
    initialSteps: z.array(campaignInitialStepInputSchema).max(50).optional()
  })
  .superRefine((data, ctx) => {
    if (hasDuplicateOrders(data.initialSteps)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Os steps não podem ter ordens repetidas',
        path: ['initialSteps']
      })
    }
  })

const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phoneNumberId: z.string().min(1).optional(),
    managerId: z.string().min(1).nullable().optional(),
    metaAdId: z.string().trim().min(1).max(100).nullable().optional(),
    ref: z.string().trim().min(1).max(100).nullable().optional(),
    fallbackText: z.string().trim().min(1).max(300).nullable().optional(),
    initialPrompt: z.string().trim().min(1).max(5000).nullable().optional(),
    isActive: z.boolean().optional(),
    initialSteps: z.array(campaignInitialStepInputSchema).max(50).optional()
  })
  .superRefine((data, ctx) => {
    if (hasDuplicateOrders(data.initialSteps)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Os steps não podem ter ordens repetidas',
        path: ['initialSteps']
      })
    }
  })

function normalizeNullableString(value?: string | null) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeInitialSteps(
  steps?: Array<{
    order: number
    type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'link'
    content?: string | null
    mediaUrl?: string | null
    storageKey?: string | null
    mimeType?: string | null
    fileName?: string | null
    delaySeconds?: number
    isActive?: boolean
  }>
) {
  if (!steps) return undefined

  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map((step) => ({
      order: step.order,
      type: step.type.toUpperCase() as
        | 'TEXT'
        | 'AUDIO'
        | 'IMAGE'
        | 'DOCUMENT'
        | 'VIDEO'
        | 'LINK',
      content: normalizeNullableString(step.content),
      mediaUrl: normalizeNullableString(step.mediaUrl),
      storageKey: normalizeNullableString(step.storageKey),
      mimeType: normalizeNullableString(step.mimeType),
      fileName: normalizeNullableString(step.fileName),
      delaySeconds: step.delaySeconds ?? 0,
      isActive: step.isActive ?? true
    }))
}

function serializeCampaign(campaign: {
  id: string
  name: string
  tenantId: string
  phoneNumberId: string
  managerId: string | null
  metaAdId: string | null
  ref: string | null
  fallbackText: string | null
  initialPrompt: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  phoneNumber?: {
    id: string
    number: string
    label: string | null
  } | null
  manager?: {
    id: string
    name: string
    email: string
    role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
  } | null
  initialSteps?: Array<{
    id: string
    order: number
    type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LINK'
    content: string | null
    mediaUrl: string | null
    storageKey: string | null
    mimeType: string | null
    fileName: string | null
    delaySeconds: number
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }>
}) {
  return {
    id: campaign.id,
    name: campaign.name,
    tenantId: campaign.tenantId,
    phoneNumberId: campaign.phoneNumberId,
    managerId: campaign.managerId ?? undefined,
    metaAdId: campaign.metaAdId ?? undefined,
    ref: campaign.ref ?? undefined,
    fallbackText: campaign.fallbackText ?? undefined,
    initialPrompt: campaign.initialPrompt ?? undefined,
    isActive: campaign.isActive,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    phoneNumber: campaign.phoneNumber
      ? {
          id: campaign.phoneNumber.id,
          number: campaign.phoneNumber.number,
          label: campaign.phoneNumber.label ?? undefined
        }
      : undefined,
    manager: campaign.manager
      ? {
          id: campaign.manager.id,
          name: campaign.manager.name,
          email: campaign.manager.email,
          role: campaign.manager.role.toLowerCase()
        }
      : undefined,
    initialSteps:
      campaign.initialSteps?.map((step) => ({
        id: step.id,
        order: step.order,
        type: step.type.toLowerCase(),
        content: step.content ?? undefined,
        mediaUrl: step.mediaUrl ?? undefined,
        storageKey: step.storageKey ?? undefined,
        mimeType: step.mimeType ?? undefined,
        fileName: step.fileName ?? undefined,
        delaySeconds: step.delaySeconds,
        isActive: step.isActive,
        createdAt: step.createdAt.toISOString(),
        updatedAt: step.updatedAt.toISOString()
      })) ?? []
  }
}

export async function campaignRoutes(app: FastifyInstance) {
    app.post('/campaigns/upload-media', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const currentUserRole = session.user.role
    const tenantId = session.user.tenantId

    if (
      currentUserRole !== 'MASTER' &&
      currentUserRole !== 'ADMIN' &&
      currentUserRole !== 'MANAGER'
    ) {
      return reply.status(403).send({
        message: 'Sem permissão para enviar mídia de campanha'
      })
    }

    if (!(request as any).isMultipart?.()) {
      return reply.status(400).send({
        message: 'A requisição precisa ser multipart/form-data'
      })
    }

    let uploadData: Awaited<ReturnType<typeof parseCampaignMediaUploadRequest>>

    try {
      uploadData = await parseCampaignMediaUploadRequest(request)
    } catch (error) {
      try {
        const parsedError = JSON.parse((error as Error).message)
        return reply.status(400).send(parsedError)
      } catch {
        return reply.status(400).send({
          message: 'Dados inválidos no upload'
        })
      }
    }

    const { type, file } = uploadData

    let processedBuffer = file.buffer
    let processedMimeType = file.mimeType
    let processedFileName = file.fileName || `${type}_${Date.now()}`

    if (type === 'audio') {
      try {
        const converted = await convertAudioToOggOpus({
          inputBuffer: file.buffer
        })

        processedBuffer = converted.buffer
        processedMimeType = converted.mimeType
        processedFileName =
          processedFileName.replace(/\.[^.]+$/i, '') +
          '.' +
          converted.fileExtension
      } catch (error) {
        request.log.error({ error }, 'Campaign audio conversion failed')
        return reply.status(500).send({
          message: 'Falha ao converter áudio da campanha'
        })
      }
    }

    if (!validateMimeTypeForCampaignStepType(type, processedMimeType)) {
      return reply.status(400).send({
        message: `Mime type inválido para ${type}: ${processedMimeType}`
      })
    }

    const detectedType = detectCampaignStepTypeFromMimeType(processedMimeType)

    if (!detectedType || detectedType !== type) {
      return reply.status(400).send({
        message: `O arquivo enviado não corresponde ao tipo declarado "${type}"`
      })
    }

    const maxFileSize = getMaxFileSizeByCampaignStepType(type)

    if (processedBuffer.length > maxFileSize) {
      return reply.status(400).send({
        message: `Arquivo excede o limite para ${type}. Máximo permitido: ${maxFileSize} bytes`
      })
    }

    const safeFileName = sanitizeFileName(processedFileName)
    const storageKey = `${getStoragePrefixByCampaignStepType(type)}/${tenantId}/${Date.now()}-${safeFileName}`

    const storageUpload = await uploadBufferToStorage({
      key: storageKey,
      body: processedBuffer,
      contentType: processedMimeType
    })

    return reply.status(201).send({
      mediaUrl: storageUpload.url,
      storageKey: storageUpload.key,
      mimeType: processedMimeType,
      fileName: safeFileName
    })
  })
  app.get('/campaigns', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role
    const currentUserId = session.user.id

    if (currentUserRole === 'AGENT') {
      return reply.status(403).send({
        message: 'Sem permissão para listar campanhas'
      })
    }

    const campaigns = await prisma.campaign.findMany({
      where: {
        tenantId,
        ...(currentUserRole === 'MANAGER'
          ? {
              OR: [{ managerId: currentUserId }, { managerId: null }]
            }
          : {})
      },
      include: {
        phoneNumber: {
          select: {
            id: true,
            number: true,
            label: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        initialSteps: {
          orderBy: {
            order: 'asc'
          }
        }
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
    })

    return campaigns.map(serializeCampaign)
  })

  app.get('/campaigns/options', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role
    const currentUserId = session.user.id

    if (currentUserRole === 'AGENT') {
      return reply.status(403).send({
        message: 'Sem permissão para listar opções de campanha'
      })
    }

    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: {
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        number: true,
        label: true
      },
      orderBy: [{ label: 'asc' }, { number: 'asc' }]
    })

    const managers = await prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: 'MANAGER',
        ...(currentUserRole === 'MANAGER' ? { id: currentUserId } : {})
      },
      select: {
        id: true,
        name: true,
        email: true
      },
      orderBy: [{ name: 'asc' }]
    })

    return {
      phoneNumbers: phoneNumbers.map((phoneNumber) => ({
        id: phoneNumber.id,
        number: phoneNumber.number,
        label: phoneNumber.label ?? undefined
      })),
      managers
    }
  })

  app.post('/campaigns', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const currentUserRole = session.user.role
    const tenantId = session.user.tenantId
    const currentUserId = session.user.id

    if (
      currentUserRole !== 'MASTER' &&
      currentUserRole !== 'ADMIN' &&
      currentUserRole !== 'MANAGER'
    ) {
      return reply.status(403).send({
        message: 'Sem permissão para criar campanha'
      })
    }

    const parsedBody = createCampaignSchema.safeParse(request.body)

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const {
      name,
      phoneNumberId,
      managerId,
      metaAdId,
      ref,
      fallbackText,
      initialPrompt,
      isActive,
      initialSteps
    } = parsedBody.data

    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id: phoneNumberId,
        tenantId,
        isActive: true
      },
      select: {
        id: true
      }
    })

    if (!phoneNumber) {
      return reply.status(404).send({
        message: 'Phone number not found'
      })
    }

    let resolvedManagerId: string | null = managerId ?? null

    if (currentUserRole === 'MANAGER') {
      resolvedManagerId = currentUserId
    }

    if (resolvedManagerId) {
      const manager = await prisma.user.findFirst({
        where: {
          id: resolvedManagerId,
          tenantId,
          isActive: true,
          role: 'MANAGER'
        },
        select: {
          id: true
        }
      })

      if (!manager) {
        return reply.status(404).send({
          message: 'Manager not found'
        })
      }
    }

    const normalizedMetaAdId = normalizeNullableString(metaAdId)
    const normalizedRef = normalizeNullableString(ref)

    if (normalizedMetaAdId) {
      const existingByMetaAdId = await prisma.campaign.findFirst({
        where: {
          tenantId,
          metaAdId: normalizedMetaAdId
        },
        select: {
          id: true,
          name: true
        }
      })

      if (existingByMetaAdId) {
        return reply.status(409).send({
          message: 'Já existe uma campanha com esse Meta Ad ID neste tenant'
        })
      }
    }

    if (normalizedRef) {
      const existingByRef = await prisma.campaign.findFirst({
        where: {
          tenantId,
          ref: normalizedRef
        },
        select: {
          id: true,
          name: true
        }
      })

      if (existingByRef) {
        return reply.status(409).send({
          message: 'Já existe uma campanha com esse ref neste tenant'
        })
      }
    }

    const normalizedInitialSteps = normalizeInitialSteps(initialSteps)

    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name,
        phoneNumberId,
        managerId: resolvedManagerId,
        metaAdId: normalizedMetaAdId,
        ref: normalizedRef,
        fallbackText: normalizeNullableString(fallbackText),
        initialPrompt: normalizeNullableString(initialPrompt),
        isActive: isActive ?? true,
        ...(normalizedInitialSteps
          ? {
              initialSteps: {
                create: normalizedInitialSteps
              }
            }
          : {})
      },
      include: {
        phoneNumber: {
          select: {
            id: true,
            number: true,
            label: true
          }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        initialSteps: {
          orderBy: {
            order: 'asc'
          }
        }
      }
    })

    return reply.status(201).send(serializeCampaign(campaign))
  })

  app.patch('/campaigns/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const currentUserRole = session.user.role
    const tenantId = session.user.tenantId
    const currentUserId = session.user.id

    if (
      currentUserRole !== 'MASTER' &&
      currentUserRole !== 'ADMIN' &&
      currentUserRole !== 'MANAGER'
    ) {
      return reply.status(403).send({
        message: 'Sem permissão para editar campanha'
      })
    }

    const parsedParams = campaignParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Invalid campaign id'
      })
    }

    const parsedBody = updateCampaignSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const { id } = parsedParams.data
    const data = parsedBody.data

    const existingCampaign = await prisma.campaign.findFirst({
      where: {
        id,
        tenantId
      },
      select: {
        id: true,
        managerId: true
      }
    })

    if (!existingCampaign) {
      return reply.status(404).send({
        message: 'Campaign not found'
      })
    }

    if (
      currentUserRole === 'MANAGER' &&
      existingCampaign.managerId &&
      existingCampaign.managerId !== currentUserId
    ) {
      return reply.status(403).send({
        message: 'Sem permissão para editar campanha de outro manager'
      })
    }

    let resolvedManagerId =
      data.managerId === undefined ? undefined : data.managerId

    if (currentUserRole === 'MANAGER') {
      resolvedManagerId = currentUserId
    }

    if (data.phoneNumberId) {
      const phoneNumber = await prisma.phoneNumber.findFirst({
        where: {
          id: data.phoneNumberId,
          tenantId,
          isActive: true
        },
        select: {
          id: true
        }
      })

      if (!phoneNumber) {
        return reply.status(404).send({
          message: 'Phone number not found'
        })
      }
    }

    if (resolvedManagerId) {
      const manager = await prisma.user.findFirst({
        where: {
          id: resolvedManagerId,
          tenantId,
          isActive: true,
          role: 'MANAGER'
        },
        select: {
          id: true
        }
      })

      if (!manager) {
        return reply.status(404).send({
          message: 'Manager not found'
        })
      }
    }

    const normalizedMetaAdId =
      data.metaAdId === undefined
        ? undefined
        : normalizeNullableString(data.metaAdId)

    const normalizedRef =
      data.ref === undefined ? undefined : normalizeNullableString(data.ref)

    if (normalizedMetaAdId) {
      const existingByMetaAdId = await prisma.campaign.findFirst({
        where: {
          tenantId,
          metaAdId: normalizedMetaAdId,
          id: {
            not: id
          }
        },
        select: {
          id: true
        }
      })

      if (existingByMetaAdId) {
        return reply.status(409).send({
          message: 'Já existe outra campanha com esse Meta Ad ID neste tenant'
        })
      }
    }

    if (normalizedRef) {
      const existingByRef = await prisma.campaign.findFirst({
        where: {
          tenantId,
          ref: normalizedRef,
          id: {
            not: id
          }
        },
        select: {
          id: true
        }
      })

      if (existingByRef) {
        return reply.status(409).send({
          message: 'Já existe outra campanha com esse ref neste tenant'
        })
      }
    }

    const normalizedInitialSteps = normalizeInitialSteps(data.initialSteps)

    const updatedCampaign = await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: {
          id
        },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.phoneNumberId !== undefined
            ? { phoneNumberId: data.phoneNumberId }
            : {}),
          ...(resolvedManagerId !== undefined
            ? { managerId: resolvedManagerId }
            : {}),
          ...(normalizedMetaAdId !== undefined
            ? { metaAdId: normalizedMetaAdId }
            : {}),
          ...(normalizedRef !== undefined ? { ref: normalizedRef } : {}),
          ...(data.fallbackText !== undefined
            ? { fallbackText: normalizeNullableString(data.fallbackText) }
            : {}),
          ...(data.initialPrompt !== undefined
            ? { initialPrompt: normalizeNullableString(data.initialPrompt) }
            : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
        }
      })

      if (normalizedInitialSteps !== undefined) {
        await tx.campaignInitialStep.deleteMany({
          where: {
            campaignId: id
          }
        })

        if (normalizedInitialSteps.length > 0) {
          await tx.campaignInitialStep.createMany({
            data: normalizedInitialSteps.map((step) => ({
              campaignId: id,
              order: step.order,
              type: step.type,
              content: step.content,
              mediaUrl: step.mediaUrl,
              storageKey: step.storageKey,
              mimeType: step.mimeType,
              fileName: step.fileName,
              delaySeconds: step.delaySeconds,
              isActive: step.isActive
            }))
          })
        }
      }

      return tx.campaign.findFirstOrThrow({
        where: {
          id,
          tenantId
        },
        include: {
          phoneNumber: {
            select: {
              id: true,
              number: true,
              label: true
            }
          },
          manager: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          initialSteps: {
            orderBy: {
              order: 'asc'
            }
          }
        }
      })
    })

    return serializeCampaign(updatedCampaign)
  })
}