import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

const paramsSchema = z.object({
  campaignId: z.string().min(1)
})

const updateSchema = z
  .object({
    mode: z.enum([
      'ROUND_ROBIN',
      'ORDERED_QUEUE',
      'MANUAL_ONLY',
      'QUEUE_WITH_TIMEOUT'
    ]),
    reassignOnTimeout: z.boolean(),
    responseTimeoutSeconds: z.number().int().min(10).max(86400),
    members: z.array(
      z.object({
        userId: z.string().min(1),
        sortOrder: z.number().int().min(1)
      })
    )
  })
  .superRefine((data, ctx) => {
    const usesQueueTimeout = data.mode === 'QUEUE_WITH_TIMEOUT'
    const requiresMembers = data.mode !== 'MANUAL_ONLY'

    if (requiresMembers && data.members.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['members'],
        message: 'Esse modo exige pelo menos um membro na distribuição'
      })
    }

    if (!usesQueueTimeout && data.reassignOnTimeout) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reassignOnTimeout'],
        message: 'Redistribuição por timeout só faz sentido em QUEUE_WITH_TIMEOUT'
      })
    }
  })

function serializeRule(rule: {
  id: string
  campaignId: string
  managerId: string
  mode: 'ROUND_ROBIN' | 'ORDERED_QUEUE' | 'MANUAL_ONLY' | 'QUEUE_WITH_TIMEOUT'
  isActive: boolean
  reassignOnTimeout: boolean
  responseTimeoutSeconds: number
  viewTimeoutSeconds: number | null
  onlyBusinessHours: boolean
  createdAt: Date
  updatedAt: Date
  members?: Array<{
    id: string
    userId: string
    sortOrder: number
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    user?: {
      id: string
      name: string
      email: string
    } | null
  }>
}) {
  return {
    id: rule.id,
    campaignId: rule.campaignId,
    managerId: rule.managerId,
    mode: rule.mode,
    isActive: rule.isActive,
    reassignOnTimeout: rule.reassignOnTimeout,
    responseTimeoutSeconds: rule.responseTimeoutSeconds,
    viewTimeoutSeconds: rule.viewTimeoutSeconds ?? undefined,
    onlyBusinessHours: rule.onlyBusinessHours,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    members:
      rule.members?.map((member) => ({
        id: member.id,
        userId: member.userId,
        sortOrder: member.sortOrder,
        isActive: member.isActive,
        createdAt: member.createdAt.toISOString(),
        updatedAt: member.updatedAt.toISOString(),
        user: member.user
          ? {
              id: member.user.id,
              name: member.user.name,
              email: member.user.email
            }
          : undefined
      })) ?? []
  }
}

export async function campaignDistributionRoutes(app: FastifyInstance) {
  app.get('/campaigns/:campaignId/distribution', async (req, reply) => {
    const session = await getSessionFromRequest(req)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const parsedParams = paramsSchema.safeParse(req.params)

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Campaign inválida'
      })
    }

    const { campaignId } = parsedParams.data

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        tenantId: session.user.tenantId,
        ...(session.user.role === 'MANAGER'
          ? { managerId: session.user.id }
          : {})
      },
      select: {
        id: true,
        managerId: true
      }
    })

    if (!campaign) {
      return reply.status(404).send({
        message: 'Campanha não encontrada'
      })
    }

    const rule = await prisma.campaignDistributionRule.findUnique({
      where: { campaignId },
      include: {
        members: {
          orderBy: { sortOrder: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    })

    if (!rule) {
      return reply.send(null)
    }

    return reply.send(serializeRule(rule))
  })

  app.patch('/campaigns/:campaignId/distribution', async (req, reply) => {
    const session = await getSessionFromRequest(req)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
      return reply.status(403).send({
        message: 'Sem permissão para configurar distribuição'
      })
    }

    const parsedParams = paramsSchema.safeParse(req.params)
    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Campaign inválida'
      })
    }

    const parsedBody = updateSchema.safeParse(req.body)
    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const { campaignId } = parsedParams.data
    const body = parsedBody.data

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        tenantId: session.user.tenantId,
        ...(session.user.role === 'MANAGER'
          ? { managerId: session.user.id }
          : {})
      },
      select: {
        id: true,
        tenantId: true,
        managerId: true,
        name: true
      }
    })

    if (!campaign) {
      return reply.status(404).send({
        message: 'Campanha não encontrada'
      })
    }

    if (!campaign.managerId) {
      return reply.status(400).send({
        message: 'A campanha precisa ter um manager definido antes da distribuição'
      })
    }

    const uniqueUserIds = [...new Set(body.members.map((member) => member.userId))]
    const uniqueSortOrders = [...new Set(body.members.map((member) => member.sortOrder))]

    if (uniqueSortOrders.length !== body.members.length) {
      return reply.status(400).send({
        message: 'Os membros não podem ter sortOrder repetido'
      })
    }

    if (uniqueUserIds.length !== body.members.length) {
      return reply.status(400).send({
        message: 'Os membros não podem repetir userId'
      })
    }

    if (body.members.length > 0) {
      const validAgents = await prisma.user.findMany({
        where: {
          tenantId: session.user.tenantId,
          isActive: true,
          role: 'AGENT',
          managerId: campaign.managerId,
          id: {
            in: uniqueUserIds
          }
        },
        select: {
          id: true
        }
      })

      const validAgentIds = new Set(validAgents.map((user) => user.id))

      const invalidUserId = uniqueUserIds.find((userId) => !validAgentIds.has(userId))

      if (invalidUserId) {
        return reply.status(400).send({
          message: 'Há atendentes inválidos para essa gerência'
        })
      }
    }

    const usesQueueTimeout = body.mode === 'QUEUE_WITH_TIMEOUT'

    const normalizedReassignOnTimeout = usesQueueTimeout
      ? body.reassignOnTimeout
      : false

    const normalizedResponseTimeoutSeconds = usesQueueTimeout
      ? body.responseTimeoutSeconds
      : 300

    const savedRule = await prisma.$transaction(async (tx) => {
      let existing = await tx.campaignDistributionRule.findUnique({
        where: { campaignId }
      })

      if (!existing) {
        existing = await tx.campaignDistributionRule.create({
          data: {
            campaignId,
            managerId: campaign.managerId!,
            mode: body.mode,
            reassignOnTimeout: normalizedReassignOnTimeout,
            responseTimeoutSeconds: normalizedResponseTimeoutSeconds
          }
        })
      } else {
        existing = await tx.campaignDistributionRule.update({
          where: { campaignId },
          data: {
            managerId: campaign.managerId!,
            mode: body.mode,
            reassignOnTimeout: normalizedReassignOnTimeout,
            responseTimeoutSeconds: normalizedResponseTimeoutSeconds
          }
        })
      }

      await tx.campaignDistributionMember.deleteMany({
        where: {
          ruleId: existing.id
        }
      })

      if (body.members.length > 0) {
        await tx.campaignDistributionMember.createMany({
          data: body.members.map((member) => ({
            ruleId: existing!.id,
            userId: member.userId,
            sortOrder: member.sortOrder
          }))
        })
      }

      return tx.campaignDistributionRule.findUniqueOrThrow({
        where: {
          campaignId
        },
        include: {
          members: {
            orderBy: {
              sortOrder: 'asc'
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      })
    })

    return reply.send(serializeRule(savedRule))
  })
}