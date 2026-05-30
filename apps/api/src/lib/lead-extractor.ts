import { prisma } from './prisma.js'
import { generateAiResponse } from './ai/ai-client.js'

type ExtractableField = {
  id: string
  key: string
  label: string
  description: string | null
  type:
    | 'TEXT'
    | 'NUMBER'
    | 'MONEY'
    | 'BOOLEAN'
    | 'DATE'
    | 'SELECT'
    | 'MULTI_SELECT'
    | 'PHONE'
    | 'EMAIL'
    | 'URL'
    | 'JSON'
}

type ExtractorResultItem = {
  key: string
  value: unknown
  displayValue?: string | null
  confidence?: number | null
  evidence?: string | null
}

function safeJsonParse(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  return JSON.parse(cleaned)
}

function normalizeDisplayValue(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeValueForField(field: ExtractableField, value: unknown) {
  if (value === null || value === undefined) return null

  if (field.type === 'NUMBER' || field.type === 'MONEY') {
    if (typeof value === 'number') return value

    if (typeof value === 'string') {
      const normalized = value
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '')

      const parsed = Number(normalized)

      return Number.isFinite(parsed) ? parsed : null
    }

    return null
  }

  if (field.type === 'BOOLEAN') {
    if (typeof value === 'boolean') return value

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()

      if (['sim', 's', 'true', '1', 'yes'].includes(normalized)) return true
      if (['não', 'nao', 'n', 'false', '0', 'no'].includes(normalized)) return false
    }

    return null
  }

  if (field.type === 'DATE') {
    if (typeof value !== 'string') return null
    return value.trim() || null
  }

  if (
    field.type === 'TEXT' ||
    field.type === 'PHONE' ||
    field.type === 'EMAIL' ||
    field.type === 'URL' ||
    field.type === 'SELECT'
  ) {
    if (typeof value === 'string') return value.trim() || null
    return normalizeDisplayValue(value)
  }

  if (field.type === 'MULTI_SELECT') {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') return [value.trim()].filter(Boolean)
    return null
  }

  return value
}

function buildExtractorPrompt(params: {
  fields: ExtractableField[]
  messagesText: string
  existingValuesText: string
}) {
  const fieldsText = params.fields
    .map((field) => {
      return [
        `- key: ${field.key}`,
        `  label: ${field.label}`,
        `  type: ${field.type}`,
        field.description ? `  description: ${field.description}` : null
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  return [
    {
      role: 'system' as const,
      content:
        'Você é um extrator de dados de CRM. Sua tarefa é ler conversas de WhatsApp e extrair SOMENTE dados factuais explicitamente informados pelo lead. Não invente. Não deduza além do texto. Retorne apenas JSON válido, sem markdown.'
    },
    {
      role: 'user' as const,
      content: `
Campos disponíveis para extração:
${fieldsText}

Valores já salvos na ficha:
${params.existingValuesText || 'Nenhum valor salvo ainda.'}

Conversa recente:
${params.messagesText}

Regras:
1. Extraia apenas campos presentes na lista.
2. Use exatamente a "key" do campo.
3. Se não houver informação nova, retorne {"updates":[]}.
4. Nunca invente CPF, renda, data, região ou nome.
5. Se o lead corrigir uma informação anterior, use a informação mais recente.
6. Para BOOLEAN, use true ou false.
7. Para MONEY e NUMBER, use número puro, sem R$.
8. Em renda familiar, interprete respostas brasileiras curtas:
   - "4" geralmente significa 4000 quando o contexto for renda.
   - "4 mil" significa 4000.
   - "minha 4 e da esposa 6" significa renda familiar 10000.
   - "4+3" significa 7000 quando o contexto for renda.
   - Se o lead informar renda de duas pessoas, some para renda familiar.
   - Se houver dúvida real, não extraia.
9. Para DATE, prefira formato YYYY-MM-DD quando a data completa estiver clara. Se só houver ano aproximado, pode retornar o texto informado.
10. Para CPF, preserve o número se aparecer, com ou sem pontuação.
11. Se o campo for CPF, aceite sequências de 11 dígitos ou CPF com pontos e traço.
12. Retorne somente JSON válido, sem markdown.

{
  "updates": [
    {
      "key": "nome_do_campo",
      "value": "valor extraído",
      "displayValue": "valor legível opcional",
      "confidence": 0.9,
      "evidence": "trecho curto que justifica"
    }
  ]
}
`
    }
  ]
}

export async function runLeadExtractorForConversation(params: {
  tenantId: string
  conversationId: string
  maxMessages?: number
}) {
  const config = await prisma.leadExtractorConfig.upsert({
    where: {
      tenantId: params.tenantId
    },
    update: {},
    create: {
      tenantId: params.tenantId,
      isEnabled: false,
      model: 'gpt-5-chat-latest',
      temperature: 0,
      maxMessages: 70,
      runOnInbound: true,
      runOnOutbound: false
    }
  })

  const fields = await prisma.leadFieldDefinition.findMany({
    where: {
      tenantId: params.tenantId,
      isActive: true,
      aiExtractable: true,
      sourceMode: {
        in: ['AI', 'AI_HUMAN']
      }
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      key: true,
      label: true,
      description: true,
      type: true
    }
  })

  if (fields.length === 0) {
    await prisma.leadExtractionRun.create({
      data: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        status: 'SKIPPED',
        errorMessage: 'Nenhum campo aiExtractable ativo encontrado'
      }
    })

    return {
      status: 'SKIPPED' as const,
      reason: 'Nenhum campo aiExtractable ativo encontrado',
      updates: []
    }
  }

  const recentMessages = await prisma.message.findMany({
    where: {
      conversationId: params.conversationId,
      OR: [
        {
          type: 'TEXT'
        },
        {
          transcription: {
            not: null
          }
        }
      ]
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: params.maxMessages ?? config.maxMessages
  })

  const orderedMessages = recentMessages.reverse()

  if (orderedMessages.length === 0) {
    await prisma.leadExtractionRun.create({
      data: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        status: 'SKIPPED',
        errorMessage: 'Nenhuma mensagem textual encontrada'
      }
    })

    return {
      status: 'SKIPPED' as const,
      reason: 'Nenhuma mensagem textual encontrada',
      updates: []
    }
  }

  const existingValues = await prisma.conversationFieldValue.findMany({
    where: {
      conversationId: params.conversationId,
      fieldId: {
        in: fields.map((field) => field.id)
      }
    },
    include: {
      field: true
    }
  })

  const existingValuesText = existingValues
    .map((item) => `${item.field.key}: ${item.displayValue ?? JSON.stringify(item.value)}`)
    .join('\n')

  const messagesText = orderedMessages
    .map((message) => {
      const sender =
        message.senderType === 'LEAD'
          ? 'Lead'
          : message.senderType === 'AI'
            ? 'IA'
            : message.senderType === 'AGENT'
              ? 'Atendente'
              : 'Sistema'

      const text = message.transcription?.trim() || message.content?.trim() || ''

      return `[${sender}] ${text}`
    })
    .filter((line) => line.trim().length > 0)
    .join('\n')

  const promptMessages = buildExtractorPrompt({
    fields,
    existingValuesText,
    messagesText
  })

  try {
    const response = await generateAiResponse({
      model: config.model,
      temperature: config.temperature,
      messages: promptMessages
    })

    const parsed = safeJsonParse(response.content) as {
      updates?: ExtractorResultItem[]
    }

    const updates = Array.isArray(parsed.updates) ? parsed.updates : []

    const fieldByKey = new Map(fields.map((field) => [field.key, field]))

    const savedUpdates = []

    for (const update of updates) {
      const field = fieldByKey.get(update.key)

      if (!field) continue

      const normalizedValue = normalizeValueForField(field, update.value)

      if (normalizedValue === null || normalizedValue === undefined) continue

      const displayValue =
        update.displayValue ??
        normalizeDisplayValue(normalizedValue)

      const previous = await prisma.conversationFieldValue.findUnique({
        where: {
          conversationId_fieldId: {
            conversationId: params.conversationId,
            fieldId: field.id
          }
        }
      })

      const saved = await prisma.$transaction(async (tx) => {
        const value = await tx.conversationFieldValue.upsert({
          where: {
            conversationId_fieldId: {
              conversationId: params.conversationId,
              fieldId: field.id
            }
          },
          update: {
            value: normalizedValue,
            displayValue,
            source: 'AI',
            confidence: update.confidence ?? null,
            evidence: update.evidence ?? null
          },
          create: {
            conversationId: params.conversationId,
            fieldId: field.id,
            value: normalizedValue,
            displayValue,
            source: 'AI',
            confidence: update.confidence ?? null,
            evidence: update.evidence ?? null
          }
        })

        await tx.conversationFieldAuditLog.create({
          data: {
            conversationId: params.conversationId,
            fieldId: field.id,
            oldValue: previous?.value ?? undefined,
            newValue: normalizedValue,
            source: 'AI',
            evidence: update.evidence ?? null
          }
        })

        return value
      })

      savedUpdates.push({
        key: field.key,
        fieldId: field.id,
        value: saved.value,
        displayValue: saved.displayValue,
        confidence: saved.confidence,
        evidence: saved.evidence
      })
    }

    await prisma.leadExtractionRun.create({
      data: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        status: 'SUCCESS',
        inputMessageIds: orderedMessages.map((message) => message.id),
        extractedData: savedUpdates
      }
    })

    return {
      status: 'SUCCESS' as const,
      updates: savedUpdates
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'

    await prisma.leadExtractionRun.create({
      data: {
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        status: 'FAILED',
        errorMessage: message
      }
    })

    return {
      status: 'FAILED' as const,
      error: message,
      updates: []
    }
  }
}