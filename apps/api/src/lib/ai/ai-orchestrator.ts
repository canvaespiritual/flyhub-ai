import { prisma } from '../prisma.js'
import { generateAiResponse, transcribeAudioBuffer } from './ai-client.js'
import { buildAiMessages } from './ai-prompt-builder.js'
import type { AiOrchestratorInput, AiGeneratedResponse } from './ai-types.js'

async function downloadBufferFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()

  return Buffer.from(arrayBuffer)
}

async function ensureMessageTextReady(input: AiOrchestratorInput) {
  const message = input.inboundMessage

  if (message.type !== 'AUDIO') {
    return message
  }

  if (message.transcription?.trim()) {
    return message
  }

  if (!message.mediaUrl) {
    await prisma.message.update({
      where: { id: message.id },
      data: {
        transcriptionStatus: 'FAILED'
      }
    })

    return message
  }

  await prisma.message.update({
    where: { id: message.id },
    data: {
      transcriptionStatus: 'PROCESSING'
    }
  })

  try {
    const audioBuffer = await downloadBufferFromUrl(message.mediaUrl)

    const mimeType = message.mimeType || 'audio/ogg'
    const fileName = message.fileName || `audio-${message.id}.ogg`

    const transcription = await transcribeAudioBuffer({
      buffer: audioBuffer,
      fileName,
      mimeType
    })

    return prisma.message.update({
      where: { id: message.id },
      data: {
        transcription,
        transcriptionStatus: 'COMPLETED',
        content: transcription
      }
    })
  } catch (error) {
    console.error('[AI_AUDIO_TRANSCRIPTION_FAILED]', {
      messageId: message.id,
      conversationId: input.conversationId,
      error
    })

    await prisma.message.update({
      where: { id: message.id },
      data: {
        transcriptionStatus: 'FAILED'
      }
    })

    return message
  }
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