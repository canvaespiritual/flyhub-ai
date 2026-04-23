import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'
import { mapPresenceStatusFromDb } from '../lib/presence-policy.js'
import { isUserEligibleForAssignment } from '../lib/routing-policy.js'

const userParamsSchema = z.object({
  id: z.string().min(1)
})

const usersQuerySchema = z.object({
  status: z.enum(['active', 'inactive', 'all']).optional().default('active')
})

const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    password: z.string().min(6).max(100),
    role: z.enum(['admin', 'manager', 'agent']),
    managerId: z.string().min(1).nullable().optional()
  })
  .superRefine((data, ctx) => {
    if (data.role === 'agent' && !data.managerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Agent precisa estar vinculado a um manager',
        path: ['managerId']
      })
    }
  })

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().optional(),
    password: z.string().min(6).max(100).optional(),
    role: z.enum(['manager', 'agent']).optional(),
    managerId: z.string().min(1).nullable().optional()
  })
  .superRefine((data, ctx) => {
    if (data.role === 'agent' && data.managerId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Agent precisa estar vinculado a um manager',
        path: ['managerId']
      })
    }
  })

const updateUserStatusSchema = z.object({
  isActive: z.boolean()
})

function serializeUser(user: {
  id: string
  name: string
  email: string
  role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
  tenantId: string
  isActive: boolean
  managerId?: string | null
  presenceStatus?: 'AVAILABLE' | 'PAUSED' | null
  manager?: {
    id: string
    name: string
    email: string
  } | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.toLowerCase(),
    tenantId: user.tenantId,
    isActive: user.isActive,
    managerId: user.managerId ?? undefined,
    manager: user.manager
      ? {
          id: user.manager.id,
          name: user.manager.name,
          email: user.manager.email
        }
      : undefined,
    presenceStatus: mapPresenceStatusFromDb(user.presenceStatus),
    eligibleForAssignment: isUserEligibleForAssignment(user)
  }
}

function normalizeRoleToDb(role: 'admin' | 'manager' | 'agent') {
  switch (role) {
    case 'admin':
      return 'ADMIN' as const
    case 'manager':
      return 'MANAGER' as const
    case 'agent':
    default:
      return 'AGENT' as const
  }
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedQuery = usersQuerySchema.safeParse(request.query)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    if (!parsedQuery.success) {
      return reply.status(400).send({
        message: 'Query inválida',
        issues: parsedQuery.error.flatten()
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role
    const currentUserId = session.user.id
    const { status } = parsedQuery.data

    if (currentUserRole === 'AGENT') {
      return reply.status(403).send({
        message: 'Sem permissão para listar usuários'
      })
    }

    const users = await prisma.user.findMany({
      where: {
        tenantId,
        ...(status === 'active'
          ? { isActive: true }
          : status === 'inactive'
            ? { isActive: false }
            : {}),
        ...(currentUserRole === 'MANAGER'
          ? {
              OR: [{ id: currentUserId }, { managerId: currentUserId }]
            }
          : {})
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        managerId: true,
        presenceStatus: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return users.map(serializeUser)
  })

  app.post('/users', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const parsedBody = createUserSchema.safeParse(request.body)

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role
    const { name, email, password, role, managerId } = parsedBody.data

    if (currentUserRole !== 'MASTER' && currentUserRole !== 'ADMIN') {
      return reply.status(403).send({
        message: 'Sem permissão para criar usuários'
      })
    }

    if (currentUserRole === 'MASTER' && role !== 'admin') {
      return reply.status(403).send({
        message: 'MASTER só pode cadastrar ADMIN'
      })
    }

    if (currentUserRole === 'ADMIN' && role === 'admin') {
      return reply.status(403).send({
        message: 'ADMIN não pode cadastrar ADMIN'
      })
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email
      },
      select: {
        id: true
      }
    })

    if (existingUser) {
      return reply.status(409).send({
        message: 'Já existe usuário com esse e-mail'
      })
    }

    const dbRole = normalizeRoleToDb(role)

    let resolvedManagerId: string | null = null

    if (dbRole === 'AGENT') {
      const manager = await prisma.user.findFirst({
        where: {
          id: managerId!,
          tenantId,
          role: 'MANAGER',
          isActive: true
        },
        select: {
          id: true
        }
      })

      if (!manager) {
        return reply.status(404).send({
          message: 'Manager não encontrado'
        })
      }

      resolvedManagerId = manager.id
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const createdUser = await prisma.user.create({
      data: {
        name,
        email,
        tenantId,
        role: dbRole,
        managerId: dbRole === 'AGENT' ? resolvedManagerId : null,
        isActive: true,
        passwordHash
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        managerId: true,
        presenceStatus: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return reply.status(201).send(serializeUser(createdUser))
  })

  app.patch('/users/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = userParamsSchema.safeParse(request.params)
    const parsedBody = updateUserSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Usuário inválido'
      })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role
    const { id } = parsedParams.data
    const { name, email, password, role, managerId } = parsedBody.data

    if (currentUserRole !== 'ADMIN') {
      return reply.status(403).send({
        message: 'Sem permissão para editar usuários'
      })
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        tenantId
      },
      select: {
        id: true,
        role: true,
        email: true,
        managerId: true
      }
    })

    if (!existingUser) {
      return reply.status(404).send({
        message: 'Usuário não encontrado'
      })
    }

    if (existingUser.role === 'MASTER' || existingUser.role === 'ADMIN') {
      return reply.status(403).send({
        message: 'ADMIN não pode editar MASTER/ADMIN nesta etapa'
      })
    }

    if (email && email !== existingUser.email) {
      const emailInUse = await prisma.user.findUnique({
        where: { email },
        select: { id: true }
      })

      if (emailInUse) {
        return reply.status(409).send({
          message: 'Já existe usuário com esse e-mail'
        })
      }
    }

    const resolvedRole = role ? normalizeRoleToDb(role) : existingUser.role
    let resolvedManagerId: string | null =
      managerId !== undefined ? managerId : existingUser.managerId ?? null

    if (resolvedRole === 'AGENT') {
      if (!resolvedManagerId) {
        return reply.status(400).send({
          message: 'Agent precisa estar vinculado a um manager'
        })
      }

      const manager = await prisma.user.findFirst({
        where: {
          id: resolvedManagerId,
          tenantId,
          role: 'MANAGER',
          isActive: true
        },
        select: {
          id: true
        }
      })

      if (!manager) {
        return reply.status(404).send({
          message: 'Manager não encontrado'
        })
      }

      resolvedManagerId = manager.id
    } else {
      resolvedManagerId = null
    }

    const updatedUser = await prisma.user.update({
      where: {
        id
      },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(role !== undefined ? { role: resolvedRole } : {}),
         ...(resolvedManagerId !== undefined ? { managerId: resolvedManagerId } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        managerId: true,
        presenceStatus: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return serializeUser(updatedUser)
  })

  app.patch('/users/:id/status', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = userParamsSchema.safeParse(request.params)
    const parsedBody = updateUserStatusSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Usuário inválido'
      })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role
    const { id } = parsedParams.data
    const { isActive } = parsedBody.data

    if (currentUserRole !== 'ADMIN') {
      return reply.status(403).send({
        message: 'Sem permissão para ativar/inativar usuários'
      })
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        tenantId
      },
      select: {
        id: true,
        role: true
      }
    })

    if (!existingUser) {
      return reply.status(404).send({
        message: 'Usuário não encontrado'
      })
    }

    if (existingUser.role === 'MASTER' || existingUser.role === 'ADMIN') {
      return reply.status(403).send({
        message: 'ADMIN não pode ativar/inativar MASTER/ADMIN nesta etapa'
      })
    }

    const updatedUser = await prisma.user.update({
      where: {
        id
      },
      data: {
        isActive
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        managerId: true,
        presenceStatus: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return serializeUser(updatedUser)
  })
}