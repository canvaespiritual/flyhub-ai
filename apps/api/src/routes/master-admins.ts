import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

const createMasterAdminSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100)
})

function serializeAdmin(user: {
  id: string
  name: string
  email: string
  tenantId: string
  isActive: boolean
  createdAt: Date
  tenant: {
    id: string
    name: string
    slug: string | null
    isActive: boolean
  }
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    tenantId: user.tenantId,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      slug: user.tenant.slug ?? undefined,
      isActive: user.tenant.isActive
    }
  }
}

export async function masterAdminRoutes(app: FastifyInstance) {
  app.get('/master/admins', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (session.user.role !== 'MASTER') {
      return reply.status(403).send({ message: 'Acesso exclusivo do MASTER' })
    }

    const admins = await prisma.user.findMany({
      where: {
        role: 'ADMIN'
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true
          }
        }
      }
    })

    return admins.map(serializeAdmin)
  })

  app.post('/master/admins', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (session.user.role !== 'MASTER') {
      return reply.status(403).send({ message: 'Acesso exclusivo do MASTER' })
    }

    const parsedBody = createMasterAdminSchema.safeParse(request.body)

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const { tenantId, name, email, password } = parsedBody.data

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, isActive: true }
    })

    if (!tenant) {
      return reply.status(404).send({ message: 'Operação não encontrada' })
    }

    if (!tenant.isActive) {
      return reply.status(409).send({
        message: 'Não é possível criar admin em operação inativa'
      })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    })

    if (existingUser) {
      return reply.status(409).send({
        message: 'Já existe usuário com esse e-mail'
      })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const admin = await prisma.user.create({
      data: {
        tenantId,
        name,
        email,
        passwordHash,
        role: 'ADMIN',
        isActive: true
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true
          }
        }
      }
    })

    return reply.status(201).send(serializeAdmin(admin))
  })
}