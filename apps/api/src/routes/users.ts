import type { FastifyInstance } from 'fastify'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'
import { mapPresenceStatusFromDb } from '../lib/presence-policy.js'
import { isUserEligibleForAssignment } from '../lib/routing-policy.js'

function serializeUser(user: {
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
    presenceStatus: mapPresenceStatusFromDb(user.presenceStatus),
    eligibleForAssignment: isUserEligibleForAssignment(user)
  }
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role

    if (currentUserRole === 'AGENT') {
      return reply.status(403).send({
        message: 'Sem permissão para listar usuários'
      })
    }

    const users = await prisma.user.findMany({
      where: {
        tenantId,
        isActive: true
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
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

    return users.map(serializeUser)
  })
}