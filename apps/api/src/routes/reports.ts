import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { getSessionFromRequest } from '../lib/auth.js'

function hasValue(value: unknown, displayValue?: string | null) {
  if (displayValue && displayValue.trim() && displayValue !== '—') return true
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/reports/operation-summary', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!['MASTER', 'ADMIN', 'MANAGER'].includes(session.user.role)) {
      return reply.status(403).send({ message: 'Sem permissão para ver relatórios' })
    }

    const tenantId = session.user.tenantId

    const conversations = await prisma.conversation.findMany({
      where: {
        tenantId,
        ...(session.user.role === 'MANAGER'
          ? {
              OR: [
                { managerId: session.user.id },
                { assignedUser: { managerId: session.user.id } }
              ]
            }
          : {})
      },
      include: {
        assignedUser: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
        fieldValues: {
          include: {
            field: true
          }
        }
      }
    })

    const fields = await prisma.leadFieldDefinition.findMany({
      where: {
        tenantId,
        isActive: true,
        isFilterable: true
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    })

    const totalLeads = conversations.length

    const byAgentMap = new Map<string, { name: string; total: number }>()
    const byCampaignMap = new Map<string, { name: string; total: number }>()

    for (const conversation of conversations) {
      const agentKey = conversation.assignedUser?.id ?? 'unassigned'
      const agentName = conversation.assignedUser?.name ?? 'Sem responsável'

      byAgentMap.set(agentKey, {
        name: agentName,
        total: (byAgentMap.get(agentKey)?.total ?? 0) + 1
      })

      const campaignKey = conversation.campaign?.id ?? 'no-campaign'
      const campaignName = conversation.campaign?.name ?? 'Sem campanha'

      byCampaignMap.set(campaignKey, {
        name: campaignName,
        total: (byCampaignMap.get(campaignKey)?.total ?? 0) + 1
      })
    }

    const fieldSummaries = fields.map((field) => {
      let filled = 0
      const valueCounts = new Map<string, number>()
      const filledByAgent = new Map<string, { name: string; total: number }>()

      for (const conversation of conversations) {
        const value = conversation.fieldValues.find((item) => item.fieldId === field.id)

        if (!value || !hasValue(value.value, value.displayValue)) continue

        filled++

        const label = value.displayValue || String(value.value ?? 'Preenchido')
        valueCounts.set(label, (valueCounts.get(label) ?? 0) + 1)

        const agentKey = conversation.assignedUser?.id ?? 'unassigned'
        const agentName = conversation.assignedUser?.name ?? 'Sem responsável'

        filledByAgent.set(agentKey, {
          name: agentName,
          total: (filledByAgent.get(agentKey)?.total ?? 0) + 1
        })
      }

      return {
        fieldId: field.id,
        key: field.key,
        label: field.label,
        type: field.type,
        filled,
        empty: totalLeads - filled,
        values: [...valueCounts.entries()]
          .map(([label, total]) => ({ label, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 12),
        byAgent: [...filledByAgent.values()].sort((a, b) => b.total - a.total)
      }
    })

    return {
      totalLeads,
      byAgent: [...byAgentMap.values()].sort((a, b) => b.total - a.total),
      byCampaign: [...byCampaignMap.values()].sort((a, b) => b.total - a.total),
      fields: fieldSummaries
    }
  })
}