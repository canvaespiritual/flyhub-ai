import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).optional().nullable(),
  timezone: z.string().trim().min(2).max(80).optional().nullable()
})

const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(2).max(80).optional().nullable(),
  timezone: z.string().trim().min(2).max(80).optional().nullable(),
  isActive: z.boolean().optional()
})

const tenantParamsSchema = z.object({
  id: z.string().min(1)
})

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function serializeTenant(tenant: {
  id: string
  name: string
  slug: string | null
  isActive: boolean
  timezone: string | null
  createdAt: Date
  updatedAt: Date
  _count?: {
    users: number
    phoneNumbers: number
    campaigns: number
    conversations: number
  }
}) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug ?? undefined,
    isActive: tenant.isActive,
    timezone: tenant.timezone ?? undefined,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    usersCount: tenant._count?.users ?? 0,
    phoneNumbersCount: tenant._count?.phoneNumbers ?? 0,
    campaignsCount: tenant._count?.campaigns ?? 0,
    conversationsCount: tenant._count?.conversations ?? 0
  }
}

export async function masterTenantRoutes(app: FastifyInstance) {
  app.get('/master/tenants', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (session.user.role !== 'MASTER') {
      return reply.status(403).send({ message: 'Acesso exclusivo do MASTER' })
    }

    const tenants = await prisma.tenant.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            users: true,
            phoneNumbers: true,
            campaigns: true,
            conversations: true
          }
        }
      }
    })

    return tenants.map(serializeTenant)
  })

  app.post('/master/tenants', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (session.user.role !== 'MASTER') {
      return reply.status(403).send({ message: 'Acesso exclusivo do MASTER' })
    }

    const parsedBody = createTenantSchema.safeParse(request.body)

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const { name, timezone } = parsedBody.data
    const slug = normalizeSlug(parsedBody.data.slug || name)

    const existingSlug = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true }
    })

    if (existingSlug) {
      return reply.status(409).send({
        message: 'Já existe uma operação com esse slug'
      })
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        timezone: timezone?.trim() || 'America/Sao_Paulo',
        isActive: true
      },
      include: {
        _count: {
          select: {
            users: true,
            phoneNumbers: true,
            campaigns: true,
            conversations: true
          }
        }
      }
    })

    return reply.status(201).send(serializeTenant(tenant))
  })

  app.patch('/master/tenants/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = tenantParamsSchema.safeParse(request.params)
    const parsedBody = updateTenantSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (session.user.role !== 'MASTER') {
      return reply.status(403).send({ message: 'Acesso exclusivo do MASTER' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Operação inválida' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const { id } = parsedParams.data
    const { name, slug, timezone, isActive } = parsedBody.data

    const existingTenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true }
    })

    if (!existingTenant) {
      return reply.status(404).send({ message: 'Operação não encontrada' })
    }

    const normalizedSlug =
      slug !== undefined && slug !== null ? normalizeSlug(slug) : undefined

    if (normalizedSlug && normalizedSlug !== existingTenant.slug) {
      const slugInUse = await prisma.tenant.findUnique({
        where: { slug: normalizedSlug },
        select: { id: true }
      })

      if (slugInUse) {
        return reply.status(409).send({
          message: 'Já existe uma operação com esse slug'
        })
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(normalizedSlug !== undefined ? { slug: normalizedSlug } : {}),
        ...(timezone !== undefined
          ? { timezone: timezone?.trim() || 'America/Sao_Paulo' }
          : {}),
        ...(isActive !== undefined ? { isActive } : {})
      },
      include: {
        _count: {
          select: {
            users: true,
            phoneNumbers: true,
            campaigns: true,
            conversations: true
          }
        }
      }
    })

    return serializeTenant(tenant)
  })
}