import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getSessionFromRequest } from '../lib/auth.js'
import { runLeadExtractorForConversation } from '../lib/lead-extractor.js'

const paramsSchema = z.object({
  conversationId: z.string().min(1)
})

export async function leadExtractorRoutes(app: FastifyInstance) {
  app.post('/conversations/:conversationId/extract-lead', async (request, reply) => {
    const session = await getSessionFromRequest(request)
    const parsedParams = paramsSchema.safeParse(request.params)

    if (!session) {
      return reply.status(401).send({ message: 'Não autenticado' })
    }

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Conversation id inválido' })
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: parsedParams.data.conversationId,
        tenantId: session.user.tenantId,
        ...(session.user.role === 'AGENT'
          ? {
              OR: [
                { assignedUserId: session.user.id },
                { assignedUserId: null }
              ]
            }
          : {}),
        ...(session.user.role === 'MANAGER'
          ? {
              OR: [
                { managerId: session.user.id },
                { managerId: null },
                {
                  assignedUser: {
                    managerId: session.user.id
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

    if (!conversation) {
      return reply.status(404).send({ message: 'Conversa não encontrada' })
    }

    const result = await runLeadExtractorForConversation({
      tenantId: conversation.tenantId,
      conversationId: conversation.id
    })

    return result
  })
}