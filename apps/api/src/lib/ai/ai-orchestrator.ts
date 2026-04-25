import { prisma } from '../prisma.js'
import { generateAiResponse } from './ai-client.js'
import { buildAiMessages } from './ai-prompt-builder.js'
import type { AiOrchestratorInput, AiGeneratedResponse } from './ai-types.js'

async function ensureMessageTextReady(input: AiOrchestratorInput) {
  const message = input.inboundMessage

  if (message.type !== 'AUDIO') {
    return message
  }

  if (message.transcription?.trim()) {
    return message
  }

  // Futuro:
  // 1. baixar mídia do WhatsApp usando externalMediaId
  // 2. converter se necessário
  // 3. transcrever com OpenAI
  // 4. salvar transcription + transcriptionStatus
  return message
}

async function findAgentForConversation(input: AiOrchestratorInput) {
  if (input.campaignId) {
    const campaignConfig = await prisma.campaignAiConfig.findUnique({
      where: {
        campaignId: input.campaignId
      },
      include: {
        agent: true
      }
    })

    if (campaignConfig?.agent?.isActive) {
      return campaignConfig.agent
    }
  }

  return prisma.aiAgent.findFirst({
    where: {
      tenantId: input.tenantId,
      isActive: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  })
}

export async function runAiOrchestrator(
  input: AiOrchestratorInput
): Promise<AiGeneratedResponse | null> {
  const agent = await findAgentForConversation(input)

  if (!agent) {
    console.warn('[AI_ORCHESTRATOR] No active AI agent found', {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      campaignId: input.campaignId
    })

    return null
  }

  await ensureMessageTextReady(input)

  const aiState = await prisma.conversationAiState.upsert({
    where: {
      conversationId: input.conversationId
    },
    update: {
      agentId: agent.id
    },
    create: {
      conversationId: input.conversationId,
      agentId: agent.id
    }
  })

  const recentMessages = await prisma.message.findMany({
    where: {
      conversationId: input.conversationId
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: agent.maxContextMessages
  })

  const messagesForPrompt = buildAiMessages({
    agent,
    contextSummary: aiState.contextSummary,
    recentMessages: recentMessages.reverse()
  })

  return generateAiResponse({
    model: agent.model,
    temperature: agent.temperature,
    messages: messagesForPrompt
  })
}