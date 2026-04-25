import type { Message } from '@prisma/client'

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiOrchestratorInput = {
  tenantId: string
  conversationId: string
  campaignId?: string | null
  inboundMessage: Message
}

export type AiGeneratedResponse = {
  content: string
}