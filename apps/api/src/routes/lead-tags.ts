import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getSessionFromRequest } from '../lib/auth.js'

const paramsSchema = z.object({
  id: z.string().min(1)
})

const conversationParamsSchema = z.object({
  conversationId: z.string().min(1)
})

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().max(80).optional().nullable(),
  color: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().optional()
})

const updateTagSchema = createTagSchema.partial()

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function assertCanManageTags(role: string) {
  return role === 'MASTER' || role === 'ADMIN'
}

function assertCanUseTags(role: string) {
  return role === 'MASTER' || role === 'ADMIN' || role === 'MANAGER' || role === 'AGENT'
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
            OR: [{ assignedUserId: params.userId }, { assignedUserId: null }]
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

export async function leadTagRoutes(app: FastifyInstance) {
  app.get('/lead-tags', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    const tags = await prisma.leadTag.findMany({
      where: {
        tenantId: session.user.tenantId
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
    })

    return tags.map((tag) => ({
      ...tag,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString()
    }))
  })

  app.post('/lead-tags', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedBody = createTagSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageTags(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para criar etiquetas' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const data = parsedBody.data
    const slug = normalizeSlug(data.slug || data.name)

    if (!slug) {
      return reply.status(400).send({ message: 'Slug inválido' })
    }

    const created = await prisma.leadTag.create({
      data: {
        tenantId: session.user.tenantId,
        name: data.name.trim(),
        slug,
        color: data.color?.trim() || null,
        description: data.description?.trim() || null,
        isActive: data.isActive ?? true
      }
    })

    return reply.status(201).send({
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString()
    })
  })

  app.patch('/lead-tags/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = paramsSchema.safeParse(request.params)
    const parsedBody = updateTagSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageTags(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para atualizar etiquetas' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Invalid tag id' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const existing = await prisma.leadTag.findFirst({
      where: {
        id: parsedParams.data.id,
        tenantId: session.user.tenantId
      }
    })

    if (!existing) {
      return reply.status(404).send({ message: 'Etiqueta não encontrada' })
    }

    const data = parsedBody.data
    const updated = await prisma.leadTag.update({
      where: {
        id: existing.id
      },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.slug !== undefined && data.slug !== null
          ? { slug: normalizeSlug(data.slug) }
          : {}),
        ...(data.color !== undefined ? { color: data.color?.trim() || null } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
      }
    })

    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    }
  })

  app.delete('/lead-tags/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = paramsSchema.safeParse(request.params)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageTags(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para remover etiquetas' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Invalid tag id' })
    }

    const existing = await prisma.leadTag.findFirst({
      where: {
        id: parsedParams.data.id,
        tenantId: session.user.tenantId
      },
      select: {
        id: true
      }
    })

    if (!existing) {
      return reply.status(404).send({ message: 'Etiqueta não encontrada' })
    }

    await prisma.leadTag.update({
      where: {
        id: existing.id
      },
      data: {
        isActive: false
      }
    })

    return { ok: true }
  })

  app.get('/conversations/:conversationId/tags', async (request, reply) => {
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

    const appliedTags = await prisma.conversationTag.findMany({
      where: {
        conversationId: conversation.id
      },
      include: {
        tag: true,
        addedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    return appliedTags.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      tag: {
        ...item.tag,
        createdAt: item.tag.createdAt.toISOString(),
        updatedAt: item.tag.updatedAt.toISOString()
      }
    }))
  })

  app.post('/conversations/:conversationId/tags/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedConversationParams = conversationParamsSchema.safeParse(request.params)
    const parsedTagParams = paramsSchema.safeParse(request.params)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanUseTags(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para aplicar etiquetas' })
    }

    if (!parsedConversationParams.success || !parsedTagParams.success) {
      return reply.status(400).send({ message: 'Parâmetros inválidos' })
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

    const tag = await prisma.leadTag.findFirst({
      where: {
        id: parsedTagParams.data.id,
        tenantId: session.user.tenantId,
        isActive: true
      },
      select: {
        id: true
      }
    })

    if (!tag) {
      return reply.status(404).send({ message: 'Etiqueta não encontrada' })
    }

    const applied = await prisma.conversationTag.upsert({
      where: {
        conversationId_tagId: {
          conversationId: conversation.id,
          tagId: tag.id
        }
      },
      update: {},
      create: {
        conversationId: conversation.id,
        tagId: tag.id,
        source: 'HUMAN',
        addedByUserId: session.user.id
      }
    })

    return {
      ...applied,
      createdAt: applied.createdAt.toISOString()
    }
  })

  app.delete('/conversations/:conversationId/tags/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedConversationParams = conversationParamsSchema.safeParse(request.params)
    const parsedTagParams = paramsSchema.safeParse(request.params)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanUseTags(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para remover etiquetas' })
    }

    if (!parsedConversationParams.success || !parsedTagParams.success) {
      return reply.status(400).send({ message: 'Parâmetros inválidos' })
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

    await prisma.conversationTag.deleteMany({
      where: {
        conversationId: conversation.id,
        tagId: parsedTagParams.data.id,
        tag: {
          tenantId: session.user.tenantId
        }
      }
    })

    return { ok: true }
  })
}