import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getSessionFromRequest } from '../lib/auth.js'

const fieldTypeSchema = z.enum([
  'TEXT',
  'NUMBER',
  'MONEY',
  'BOOLEAN',
  'DATE',
  'SELECT',
  'MULTI_SELECT',
  'PHONE',
  'EMAIL',
  'URL',
  'JSON'
])

const sourceModeSchema = z.enum([
  'SYSTEM',
  'AI',
  'HUMAN',
  'AI_HUMAN',
  'SYSTEM_HUMAN'
])

const valueSourceSchema = z.enum(['SYSTEM', 'AI', 'HUMAN'])

const paramsSchema = z.object({
  id: z.string().min(1)
})

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1)
})

const createFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  type: fieldTypeSchema,
  sourceMode: sourceModeSchema.default('HUMAN'),
  options: z.any().optional().nullable(),
  defaultValue: z.any().optional().nullable(),
  isActive: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  isVisibleOnCard: z.boolean().optional(),
  isSensitive: z.boolean().optional(),
  aiExtractable: z.boolean().optional(),
  order: z.coerce.number().int().min(0).max(9999).optional()
})

const updateFieldSchema = createFieldSchema.partial()

const updateConversationFieldValueSchema = z.object({
  value: z.any().optional().nullable(),
  displayValue: z.string().trim().max(2000).nullable().optional(),
  source: valueSourceSchema.optional()
})

function assertCanManageFields(role: string) {
  return role === 'MASTER' || role === 'ADMIN'
}

function assertCanEditConversationData(role: string) {
  return role === 'MASTER' || role === 'ADMIN' || role === 'MANAGER' || role === 'AGENT'
}

function normalizeKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function stringifyDisplayValue(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function getAccessibleConversation(params: {
  conversationId: string
  tenantId: string
  userId: string
  role: string
}) {
  return prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      tenantId: params.tenantId,
      ...(params.role === 'AGENT'
        ? {
            OR: [
              { assignedUserId: params.userId },
              { assignedUserId: null }
            ]
          }
        : {}),
      ...(params.role === 'MANAGER'
        ? {
            OR: [
              { managerId: params.userId },
              { managerId: null },
              {
                assignedUser: {
                  managerId: params.userId
                }
              }
            ]
          }
        : {})
    },
    select: {
      id: true,
      tenantId: true
    }
  })
}

export async function leadFieldRoutes(app: FastifyInstance) {
  app.get('/lead-fields', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    const fields = await prisma.leadFieldDefinition.findMany({
      where: {
        tenantId: session.user.tenantId
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    })

    return fields.map((field) => ({
      ...field,
      createdAt: field.createdAt.toISOString(),
      updatedAt: field.updatedAt.toISOString()
    }))
  })

  app.post('/lead-fields', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedBody = createFieldSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageFields(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para criar campos do lead' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const data = parsedBody.data
    const key = normalizeKey(data.key)

    if (!key) {
      return reply.status(400).send({ message: 'Chave inválida' })
    }

    const created = await prisma.leadFieldDefinition.create({
      data: {
        tenantId: session.user.tenantId,
        key,
        label: data.label.trim(),
        description: data.description?.trim() || null,
        type: data.type,
        sourceMode: data.sourceMode,
        options: data.options ?? undefined,
        defaultValue: data.defaultValue ?? undefined,
        isActive: data.isActive ?? true,
        isRequired: data.isRequired ?? false,
        isFilterable: data.isFilterable ?? true,
        isVisibleOnCard: data.isVisibleOnCard ?? true,
        isSensitive: data.isSensitive ?? false,
        aiExtractable: data.aiExtractable ?? false,
        order: data.order ?? 0
      }
    })

    return reply.status(201).send({
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString()
    })
  })

  app.patch('/lead-fields/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = paramsSchema.safeParse(request.params)
    const parsedBody = updateFieldSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageFields(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para atualizar campos do lead' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Invalid field id' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const existing = await prisma.leadFieldDefinition.findFirst({
      where: {
        id: parsedParams.data.id,
        tenantId: session.user.tenantId
      }
    })

    if (!existing) {
      return reply.status(404).send({ message: 'Campo não encontrado' })
    }

    const data = parsedBody.data
    const normalizedKey = data.key ? normalizeKey(data.key) : undefined

    const updated = await prisma.leadFieldDefinition.update({
      where: {
        id: existing.id
      },
      data: {
        ...(normalizedKey ? { key: normalizedKey } : {}),
        ...(data.label !== undefined ? { label: data.label.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.sourceMode !== undefined ? { sourceMode: data.sourceMode } : {}),
        ...(data.options !== undefined ? { options: data.options ?? undefined } : {}),
        ...(data.defaultValue !== undefined
          ? { defaultValue: data.defaultValue ?? undefined }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.isRequired !== undefined ? { isRequired: data.isRequired } : {}),
        ...(data.isFilterable !== undefined ? { isFilterable: data.isFilterable } : {}),
        ...(data.isVisibleOnCard !== undefined
          ? { isVisibleOnCard: data.isVisibleOnCard }
          : {}),
        ...(data.isSensitive !== undefined ? { isSensitive: data.isSensitive } : {}),
        ...(data.aiExtractable !== undefined ? { aiExtractable: data.aiExtractable } : {}),
        ...(data.order !== undefined ? { order: data.order } : {})
      }
    })

    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    }
  })

  app.delete('/lead-fields/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = paramsSchema.safeParse(request.params)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageFields(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para remover campos do lead' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Invalid field id' })
    }

    const existing = await prisma.leadFieldDefinition.findFirst({
      where: {
        id: parsedParams.data.id,
        tenantId: session.user.tenantId
      },
      select: {
        id: true
      }
    })

    if (!existing) {
      return reply.status(404).send({ message: 'Campo não encontrado' })
    }

    await prisma.leadFieldDefinition.update({
      where: {
        id: existing.id
      },
      data: {
        isActive: false
      }
    })

    return { ok: true }
  })

  app.get('/conversations/:conversationId/field-values', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = conversationParamsSchema.safeParse(request.params)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Invalid conversation id' })
    }

    const conversation = await getAccessibleConversation({
      conversationId: parsedParams.data.conversationId,
      tenantId: session.user.tenantId,
      userId: session.user.id,
      role: session.user.role
    })

    if (!conversation) {
      return reply.status(404).send({ message: 'Conversa não encontrada' })
    }

    const fields = await prisma.leadFieldDefinition.findMany({
      where: {
        tenantId: session.user.tenantId,
        isActive: true
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    })

    const values = await prisma.conversationFieldValue.findMany({
      where: {
        conversationId: conversation.id
      }
    })

    const valueByFieldId = new Map(values.map((value) => [value.fieldId, value]))

    return fields.map((field) => {
      const value = valueByFieldId.get(field.id)

      return {
        field: {
          ...field,
          createdAt: field.createdAt.toISOString(),
          updatedAt: field.updatedAt.toISOString()
        },
        value: value
          ? {
              ...value,
              createdAt: value.createdAt.toISOString(),
              updatedAt: value.updatedAt.toISOString()
            }
          : null
      }
    })
  })

  app.patch('/conversations/:conversationId/field-values/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedConversationParams = conversationParamsSchema.safeParse(request.params)
    const parsedFieldParams = paramsSchema.safeParse(request.params)
    const parsedBody = updateConversationFieldValueSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanEditConversationData(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para editar ficha do lead' })
    }

    if (!parsedConversationParams.success || !parsedFieldParams.success) {
      return reply.status(400).send({ message: 'Parâmetros inválidos' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const conversation = await getAccessibleConversation({
      conversationId: parsedConversationParams.data.conversationId,
      tenantId: session.user.tenantId,
      userId: session.user.id,
      role: session.user.role
    })

    if (!conversation) {
      return reply.status(404).send({ message: 'Conversa não encontrada' })
    }

    const field = await prisma.leadFieldDefinition.findFirst({
      where: {
        id: parsedFieldParams.data.id,
        tenantId: session.user.tenantId,
        isActive: true
      }
    })

    if (!field) {
      return reply.status(404).send({ message: 'Campo não encontrado' })
    }

    if (field.sourceMode === 'SYSTEM') {
      return reply.status(403).send({
        message: 'Este campo é preenchido apenas pelo sistema'
      })
    }

    const body = parsedBody.data
    const source = body.source ?? 'HUMAN'
    const displayValue =
      body.displayValue !== undefined
        ? body.displayValue
        : stringifyDisplayValue(body.value)

    const previous = await prisma.conversationFieldValue.findUnique({
      where: {
        conversationId_fieldId: {
          conversationId: conversation.id,
          fieldId: field.id
        }
      }
    })

    const saved = await prisma.$transaction(async (tx) => {
      const value = await tx.conversationFieldValue.upsert({
        where: {
          conversationId_fieldId: {
            conversationId: conversation.id,
            fieldId: field.id
          }
        },
        update: {
          value: body.value ?? undefined,
          displayValue,
          source,
          updatedByUserId: session.user.id
        },
        create: {
          conversationId: conversation.id,
          fieldId: field.id,
          value: body.value ?? undefined,
          displayValue,
          source,
          updatedByUserId: session.user.id
        }
      })

      await tx.conversationFieldAuditLog.create({
        data: {
          conversationId: conversation.id,
          fieldId: field.id,
          oldValue: previous?.value ?? undefined,
          newValue: body.value ?? undefined,
          source,
          changedByUserId: session.user.id
        }
      })

      return value
    })

    return {
      ...saved,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    }
  })
}