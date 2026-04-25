import type { AiAgent, Message } from '@prisma/client'
import type { AiChatMessage } from './ai-types.js'

function messageToText(message: Message) {
  if (message.transcription?.trim()) return message.transcription.trim()
  if (message.content?.trim()) return message.content.trim()

  if (message.type === 'AUDIO') return '[Áudio recebido ainda sem transcrição]'
  if (message.type === 'IMAGE') return '[Imagem recebida]'
  if (message.type === 'DOCUMENT') return '[Documento recebido]'
  if (message.type === 'VIDEO') return '[Vídeo recebido]'
  if (message.type === 'LOCATION') return '[Localização recebida]'

  return '[Mensagem sem conteúdo textual]'
}

export function buildAiSystemPrompt(agent: AiAgent) {
  return `
Você é ${agent.name}.

OBJETIVO:
${agent.objective ?? 'Conduzir o atendimento com clareza, contexto e foco em conversão.'}

TOM:
${agent.tone ?? 'Consultivo, humano, claro, objetivo e profissional.'}

DIRETRIZ BASE:
${agent.basePrompt ?? ''}

REGRAS DE NEGÓCIO:
${agent.businessRules ?? ''}

REGRAS DE SEGURANÇA:
${agent.safetyRules ?? ''}

REGRAS DE TRANSFERÊNCIA PARA HUMANO:
${agent.handoffRules ?? ''}

REGRAS GERAIS:
- Responda sempre em português do Brasil.
- Seja natural, direto e humano.
- Não invente dados que não foram informados.
- Se faltar informação importante, faça uma pergunta objetiva.
- Não entregue tudo de uma vez; conduza por etapas.
- Não prometa aprovação, valores finais ou condições definitivas.
`.trim()
}

export function buildAiMessages(params: {
  agent: AiAgent
  recentMessages: Message[]
  contextSummary?: string | null
}): AiChatMessage[] {
  const messages: AiChatMessage[] = [
    {
      role: 'system',
      content: buildAiSystemPrompt(params.agent)
    }
  ]

  if (params.contextSummary?.trim()) {
    messages.push({
      role: 'system',
      content: `RESUMO ATUAL DA CONVERSA:\n${params.contextSummary.trim()}`
    })
  }

  for (const message of params.recentMessages) {
    if (message.senderType === 'SYSTEM') continue

    messages.push({
      role: message.senderType === 'LEAD' ? 'user' : 'assistant',
      content: messageToText(message)
    })
  }

  return messages
}