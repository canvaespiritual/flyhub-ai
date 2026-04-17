import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'
import {
  canManagePresence,
  mapPresenceStatusFromDb,
  mapPresenceStatusToDb
} from '../lib/presence-policy.js'

const updatePresenceSchema = z.object({
  status: z.enum(['available', 'paused'])
})

function serializePresence(user: {
  id: string
  name: string
  email: string
  role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
  tenantId: string
  isActive: boolean
  presenceStatus?: 'AVAILABLE' | 'PAUSED' | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.toLowerCase(),
    tenantId: user.tenantId,
    isActive: user.isActive,
    presenceStatus: mapPresenceStatusFromDb(user.presenceStatus)
  }
}

export async function presenceRoutes(app: FastifyInstance) {
  app.get('/presence/me', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const user = await prisma.user.findFirst({
      where: {
        id: session.user.id,
        tenantId: session.user.tenantId,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        presenceStatus: true
      }
    })

    if (!user) {
      return reply.status(404).send({
        message: 'Usuário não encontrado'
      })
    }

    return serializePresence(user)
  })

  app.patch('/presence/me', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedBody = updatePresenceSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    if (!canManagePresence(session.user.role)) {
      return reply.status(403).send({
        message: 'Sem permissão para alterar presença'
      })
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: session.user.id
      },
      data: {
        presenceStatus: mapPresenceStatusToDb(parsedBody.data.status)
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        presenceStatus: true
      }
    })

    return serializePresence(updatedUser)
  })
}