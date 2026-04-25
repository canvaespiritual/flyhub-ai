import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

const paramsSchema = z.object({
  id: z.string().min(1)
})

const campaignLinkSchema = z.object({
  campaignId: z.string().min(1),
  agentId: z.string().min(1).nullable()
})

const aiAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  model: z.string().trim().min(1).max(120).optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxContextMessages: z.coerce.number().int().min(1).max(50).optional(),
  objective: z.string().trim().max(5000).nullable().optional(),
  tone: z.string().trim().max(3000).nullable().optional(),
  basePrompt: z.string().trim().max(30000).nullable().optional(),
  safetyRules: z.string().trim().max(20000).nullable().optional(),
  handoffRules: z.string().trim().max(20000).nullable().optional(),
  businessRules: z.string().trim().max(30000).nullable().optional(),

  stages: z.array(z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(120),
    order: z.coerce.number().int().min(1).max(999),
    objective: z.string().trim().max(5000).nullable().optional(),
    instructions: z.string().trim().max(20000).nullable().optional(),
    isActive: z.boolean().optional()
  })).optional(),

  objections: z.array(z.object({
    id: z.string().optional(),
    stageId: z.string().nullable().optional(),
    title: z.string().trim().min(1).max(200),
    triggers: z.string().trim().max(10000).nullable().optional(),
    response: z.string().trim().max(20000).nullable().optional(),
    isActive: z.boolean().optional()
  })).optional(),

  resources: z.array(z.object({
    id: z.string().optional(),
    type: z.enum(['LINK', 'AUDIO', 'VIDEO', 'IMAGE', 'PDF', 'DOCUMENT', 'TEXT']),
    title: z.string().trim().min(1).max(200),
    url: z.string().trim().max(5000).nullable().optional(),
    description: z.string().trim().max(10000).nullable().optional(),
    isActive: z.boolean().optional()
  })).optional(),

  knowledgeTables: z.array(z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(200),
    type: z.enum(['SIMULATION', 'DOCUMENTS', 'PRICING', 'FAQ', 'CUSTOM']),
    isActive: z.boolean().optional(),
    rows: z.array(z.object({
      id: z.string().optional(),
      data: z.any()
    })).optional()
  })).optional(),

  followupRules: z.array(z.object({
    id: z.string().optional(),
    delayMinutes: z.coerce.number().int().min(1).max(10080),
    message: z.string().trim().min(1).max(10000),
    windowType: z.enum(['SERVICE_24H', 'ENTRY_POINT_72H', 'TEMPLATE_AFTER_WINDOW']),
    isActive: z.boolean().optional()
  })).optional(),

  successExamples: z.array(z.object({
    id: z.string().optional(),
    title: z.string().trim().min(1).max(200),
    transcript: z.string().trim().min(1).max(30000),
    isActive: z.boolean().optional()
  })).optional()
})

function normalizeNullable(value?: string | null) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function assertCanManageAi(role: string) {
  return role === 'MASTER' || role === 'ADMIN' || role === 'MANAGER'
}

function serializeAgent(agent: any) {
  return {
    ...agent,
    createdAt: agent.createdAt?.toISOString?.() ?? agent.createdAt,
    updatedAt: agent.updatedAt?.toISOString?.() ?? agent.updatedAt
  }
}

async function createPromptVersion(agentId: string) {
  const agent = await prisma.aiAgent.findUnique({
    where: { id: agentId },
    include: {
      stages: { where: { isActive: true }, orderBy: { order: 'asc' } },
      objections: { where: { isActive: true } },
      resources: { where: { isActive: true } },
      knowledgeTables: {
        where: { isActive: true },
        include: { rows: true }
      },
      followupRules: { where: { isActive: true } },
      successExamples: { where: { isActive: true } }
    }
  })

  if (!agent) return

  const content = JSON.stringify(
    {
      identity: {
        name: agent.name,
        objective: agent.objective,
        tone: agent.tone,
        basePrompt: agent.basePrompt,
        businessRules: agent.businessRules,
        safetyRules: agent.safetyRules,
        handoffRules: agent.handoffRules
      },
      stages: agent.stages,
      objections: agent.objections,
      resources: agent.resources,
      knowledgeTables: agent.knowledgeTables,
      followupRules: agent.followupRules,
      successExamples: agent.successExamples
    },
    null,
    2
  )

  await prisma.aiPromptVersion.create({
    data: {
      agentId,
      content,
      status: 'PUBLISHED'
    }
  })
}

export async function aiAgentRoutes(app: FastifyInstance) {
  app.get('/ai/agents', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageAi(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para listar agentes IA' })
    }

    const agents = await prisma.aiAgent.findMany({
      where: {
        tenantId: session.user.tenantId
      },
      include: {
        campaignConfigs: {
          include: {
            campaign: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        _count: {
          select: {
            stages: true,
            objections: true,
            resources: true,
            knowledgeTables: true,
            followupRules: true,
            successExamples: true
          }
        }
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
    })

    return agents.map(serializeAgent)
  })

  app.get('/ai/agents/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = paramsSchema.safeParse(request.params)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Invalid agent id' })
    }

    if (!assertCanManageAi(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para ver agente IA' })
    }

    const agent = await prisma.aiAgent.findFirst({
      where: {
        id: parsedParams.data.id,
        tenantId: session.user.tenantId
      },
      include: {
        stages: { orderBy: { order: 'asc' } },
        objections: true,
        resources: true,
        knowledgeTables: {
          include: {
            rows: true
          }
        },
        followupRules: true,
        successExamples: true,
        promptVersions: {
          orderBy: {
            id: 'desc'
          },
          take: 5
        },
        campaignConfigs: {
          include: {
            campaign: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    })

    if (!agent) {
      return reply.status(404).send({ message: 'Agente IA não encontrado' })
    }

    return serializeAgent(agent)
  })

  app.post('/ai/agents', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedBody = aiAgentSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageAi(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para criar agente IA' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const data = parsedBody.data

    const created = await prisma.$transaction(async (tx) => {
      const agent = await tx.aiAgent.create({
        data: {
          tenantId: session.user.tenantId,
          name: data.name,
          slug: normalizeNullable(data.slug),
          description: normalizeNullable(data.description),
          isActive: data.isActive ?? true,
          model: data.model ?? 'gpt-4o-mini',
          temperature: data.temperature ?? 0.4,
          maxContextMessages: data.maxContextMessages ?? 12,
          objective: normalizeNullable(data.objective),
          tone: normalizeNullable(data.tone),
          basePrompt: normalizeNullable(data.basePrompt),
          safetyRules: normalizeNullable(data.safetyRules),
          handoffRules: normalizeNullable(data.handoffRules),
          businessRules: normalizeNullable(data.businessRules)
        }
      })

      if (data.stages?.length) {
        await tx.aiStage.createMany({
          data: data.stages.map((stage) => ({
            agentId: agent.id,
            name: stage.name,
            order: stage.order,
            objective: normalizeNullable(stage.objective),
            instructions: normalizeNullable(stage.instructions),
            isActive: stage.isActive ?? true
          }))
        })
      }

      if (data.objections?.length) {
        await tx.aiObjection.createMany({
          data: data.objections.map((item) => ({
            agentId: agent.id,
            stageId: item.stageId ?? null,
            title: item.title,
            triggers: normalizeNullable(item.triggers),
            response: normalizeNullable(item.response),
            isActive: item.isActive ?? true
          }))
        })
      }

      if (data.resources?.length) {
        await tx.aiResource.createMany({
          data: data.resources.map((item) => ({
            agentId: agent.id,
            type: item.type,
            title: item.title,
            url: normalizeNullable(item.url),
            description: normalizeNullable(item.description),
            isActive: item.isActive ?? true
          }))
        })
      }

      if (data.knowledgeTables?.length) {
        for (const table of data.knowledgeTables) {
          const createdTable = await tx.aiKnowledgeTable.create({
            data: {
              agentId: agent.id,
              name: table.name,
              type: table.type,
              isActive: table.isActive ?? true
            }
          })

          if (table.rows?.length) {
            await tx.aiKnowledgeRow.createMany({
              data: table.rows.map((row) => ({
                tableId: createdTable.id,
                data: row.data
              }))
            })
          }
        }
      }

      if (data.followupRules?.length) {
        await tx.aiFollowupRule.createMany({
          data: data.followupRules.map((item) => ({
            agentId: agent.id,
            delayMinutes: item.delayMinutes,
            message: item.message,
            windowType: item.windowType,
            isActive: item.isActive ?? true
          }))
        })
      }

      if (data.successExamples?.length) {
        await tx.aiSuccessExample.createMany({
          data: data.successExamples.map((item) => ({
            agentId: agent.id,
            title: item.title,
            transcript: item.transcript,
            isActive: item.isActive ?? true
          }))
        })
      }

      return agent
    })

    await createPromptVersion(created.id)

    return reply.status(201).send(created)
  })

  app.patch('/ai/agents/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = paramsSchema.safeParse(request.params)
    const parsedBody = aiAgentSchema.partial().safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Invalid agent id' })
    }

    if (!assertCanManageAi(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para editar agente IA' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const existing = await prisma.aiAgent.findFirst({
      where: {
        id: parsedParams.data.id,
        tenantId: session.user.tenantId
      },
      select: { id: true }
    })

    if (!existing) {
      return reply.status(404).send({ message: 'Agente IA não encontrado' })
    }

    const data = parsedBody.data

    const updated = await prisma.$transaction(async (tx) => {
      await tx.aiAgent.update({
        where: { id: parsedParams.data.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.slug !== undefined ? { slug: normalizeNullable(data.slug) } : {}),
          ...(data.description !== undefined ? { description: normalizeNullable(data.description) } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.model !== undefined ? { model: data.model } : {}),
          ...(data.temperature !== undefined ? { temperature: data.temperature } : {}),
          ...(data.maxContextMessages !== undefined ? { maxContextMessages: data.maxContextMessages } : {}),
          ...(data.objective !== undefined ? { objective: normalizeNullable(data.objective) } : {}),
          ...(data.tone !== undefined ? { tone: normalizeNullable(data.tone) } : {}),
          ...(data.basePrompt !== undefined ? { basePrompt: normalizeNullable(data.basePrompt) } : {}),
          ...(data.safetyRules !== undefined ? { safetyRules: normalizeNullable(data.safetyRules) } : {}),
          ...(data.handoffRules !== undefined ? { handoffRules: normalizeNullable(data.handoffRules) } : {}),
          ...(data.businessRules !== undefined ? { businessRules: normalizeNullable(data.businessRules) } : {})
        }
      })

      if (data.stages !== undefined) {
        await tx.aiStage.deleteMany({ where: { agentId: parsedParams.data.id } })

        if (data.stages.length) {
          await tx.aiStage.createMany({
            data: data.stages.map((stage) => ({
              agentId: parsedParams.data.id,
              name: stage.name,
              order: stage.order,
              objective: normalizeNullable(stage.objective),
              instructions: normalizeNullable(stage.instructions),
              isActive: stage.isActive ?? true
            }))
          })
        }
      }

      if (data.objections !== undefined) {
        await tx.aiObjection.deleteMany({ where: { agentId: parsedParams.data.id } })

        if (data.objections.length) {
          await tx.aiObjection.createMany({
            data: data.objections.map((item) => ({
              agentId: parsedParams.data.id,
              stageId: item.stageId ?? null,
              title: item.title,
              triggers: normalizeNullable(item.triggers),
              response: normalizeNullable(item.response),
              isActive: item.isActive ?? true
            }))
          })
        }
      }

      if (data.resources !== undefined) {
        await tx.aiResource.deleteMany({ where: { agentId: parsedParams.data.id } })

        if (data.resources.length) {
          await tx.aiResource.createMany({
            data: data.resources.map((item) => ({
              agentId: parsedParams.data.id,
              type: item.type,
              title: item.title,
              url: normalizeNullable(item.url),
              description: normalizeNullable(item.description),
              isActive: item.isActive ?? true
            }))
          })
        }
      }

      if (data.knowledgeTables !== undefined) {
        await tx.aiKnowledgeTable.deleteMany({ where: { agentId: parsedParams.data.id } })

        for (const table of data.knowledgeTables) {
          const createdTable = await tx.aiKnowledgeTable.create({
            data: {
              agentId: parsedParams.data.id,
              name: table.name,
              type: table.type,
              isActive: table.isActive ?? true
            }
          })

          if (table.rows?.length) {
            await tx.aiKnowledgeRow.createMany({
              data: table.rows.map((row) => ({
                tableId: createdTable.id,
                data: row.data
              }))
            })
          }
        }
      }

      if (data.followupRules !== undefined) {
        await tx.aiFollowupRule.deleteMany({ where: { agentId: parsedParams.data.id } })

        if (data.followupRules.length) {
          await tx.aiFollowupRule.createMany({
            data: data.followupRules.map((item) => ({
              agentId: parsedParams.data.id,
              delayMinutes: item.delayMinutes,
              message: item.message,
              windowType: item.windowType,
              isActive: item.isActive ?? true
            }))
          })
        }
      }

      if (data.successExamples !== undefined) {
        await tx.aiSuccessExample.deleteMany({ where: { agentId: parsedParams.data.id } })

        if (data.successExamples.length) {
          await tx.aiSuccessExample.createMany({
            data: data.successExamples.map((item) => ({
              agentId: parsedParams.data.id,
              title: item.title,
              transcript: item.transcript,
              isActive: item.isActive ?? true
            }))
          })
        }
      }

      return tx.aiAgent.findUniqueOrThrow({
        where: { id: parsedParams.data.id },
        include: {
          stages: { orderBy: { order: 'asc' } },
          objections: true,
          resources: true,
          knowledgeTables: { include: { rows: true } },
          followupRules: true,
          successExamples: true,
          campaignConfigs: {
            include: {
              campaign: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      })
    })

    await createPromptVersion(updated.id)

    return serializeAgent(updated)
  })

  app.patch('/ai/campaign-link', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedBody = campaignLinkSchema.safeParse(request.body)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!assertCanManageAi(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para vincular IA à campanha' })
    }

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Invalid request body',
        issues: parsedBody.error.flatten()
      })
    }

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: parsedBody.data.campaignId,
        tenantId: session.user.tenantId
      },
      select: { id: true }
    })

    if (!campaign) {
      return reply.status(404).send({ message: 'Campanha não encontrada' })
    }

    if (!parsedBody.data.agentId) {
      await prisma.campaignAiConfig.deleteMany({
        where: {
          campaignId: parsedBody.data.campaignId
        }
      })

      return { ok: true, linked: false }
    }

    const agent = await prisma.aiAgent.findFirst({
      where: {
        id: parsedBody.data.agentId,
        tenantId: session.user.tenantId
      },
      select: { id: true }
    })

    if (!agent) {
      return reply.status(404).send({ message: 'Agente IA não encontrado' })
    }

    await prisma.campaignAiConfig.upsert({
      where: {
        campaignId: parsedBody.data.campaignId
      },
      update: {
        agentId: parsedBody.data.agentId
      },
      create: {
        campaignId: parsedBody.data.campaignId,
        agentId: parsedBody.data.agentId
      }
    })

    return { ok: true, linked: true }
  })
}