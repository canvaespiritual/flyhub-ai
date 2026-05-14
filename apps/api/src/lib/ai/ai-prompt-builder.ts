import type {
  AiAgent,
  AiKnowledgeRow,
  AiKnowledgeTable,
  AiObjection,
  AiResource,
  AiStage,
  AiSuccessExample,
  Message
} from '@prisma/client'
import type { AiChatMessage } from './ai-types.js'

type AiAgentForPrompt = AiAgent & {
  stages?: AiStage[]
  objections?: AiObjection[]
  resources?: AiResource[]
  knowledgeTables?: Array<AiKnowledgeTable & { rows?: AiKnowledgeRow[] }>
  successExamples?: AiSuccessExample[]
}

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

function buildStagesSection(stages?: AiStage[]) {
  if (!stages?.length) return ''

  return `
FASES DO ATENDIMENTO:
${stages
  .map(
    (stage) => `
${stage.order}. ${stage.name}
Objetivo: ${stage.objective ?? 'Não informado'}
Instruções: ${stage.instructions ?? 'Não informado'}
`.trim()
  )
  .join('\n\n')}
`.trim()
}

function buildObjectionsSection(objections?: AiObjection[]) {
  if (!objections?.length) return ''

  return `
OBJEÇÕES E RESPOSTAS:
${objections
  .map(
    (item) => `
Objeção: ${item.title}
Gatilhos: ${item.triggers ?? 'Não informado'}
Resposta recomendada: ${item.response ?? 'Não informado'}
`.trim()
  )
  .join('\n\n')}
`.trim()
}

function buildResourcesSection(resources?: AiResource[]) {
  if (!resources?.length) return ''

  return `
MATERIAIS DISPONÍVEIS:
${resources
  .map(
    (item) => `
${item.title} (${item.type})
Descrição: ${item.description ?? 'Não informado'}
URL: ${item.url ?? 'Não informado'}
`.trim()
  )
  .join('\n\n')}

Use materiais somente quando fizer sentido para o avanço da conversa. Não despeje todos de uma vez.
`.trim()
}

function buildKnowledgeTablesSection(
  knowledgeTables?: Array<AiKnowledgeTable & { rows?: AiKnowledgeRow[] }>
) {
  if (!knowledgeTables?.length) return ''

  return `
TABELAS DE CONHECIMENTO:
${knowledgeTables
  .map(
    (table) => `
${table.name} (${table.type})
${(table.rows ?? [])
  .map((row) => JSON.stringify(row.data))
  .join('\n')}
`.trim()
  )
  .join('\n\n')}
`.trim()
}

function buildSuccessExamplesSection(examples?: AiSuccessExample[]) {
  if (!examples?.length) return ''

  return `
EXEMPLOS DE CONVERSAS BEM-SUCEDIDAS:
${examples
  .map(
    (item) => `
${item.title}
${item.transcript}
`.trim()
  )
  .join('\n\n')}

Use os exemplos como referência de condução, não como texto para copiar literalmente.
`.trim()
}

export function buildAiSystemPrompt(agent: AiAgentForPrompt) {
  const sections = [
    `
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
`.trim(),
    buildStagesSection(agent.stages),
    buildObjectionsSection(agent.objections),
    buildResourcesSection(agent.resources),
    buildKnowledgeTablesSection(agent.knowledgeTables),
    buildSuccessExamplesSection(agent.successExamples),
    `
REGRAS GERAIS:
- Responda sempre em português do Brasil.
- Seja natural, direto e humano.
- Não invente dados que não foram informados.
- Se faltar informação importante, faça uma pergunta objetiva.
- Não entregue tudo de uma vez; conduza por etapas.
- Não prometa aprovação, valores finais ou condições definitivas.
- Considere o histórico da conversa antes de responder.
- Se a sequência inicial já apresentou algo, continue a partir dela sem repetir abertura.
`.trim()
  ]

  return sections.filter(Boolean).join('\n\n')
}

export function buildAiMessages(params: {
  agent: AiAgentForPrompt
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
    const content = messageToText(message)

    if (message.senderType === 'SYSTEM' && message.direction === 'INBOUND') {
      continue
    }

    messages.push({
      role: message.senderType === 'LEAD' ? 'user' : 'assistant',
      content
    })
  }

  return messages
}