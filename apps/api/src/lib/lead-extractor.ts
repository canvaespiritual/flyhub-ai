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

const APPROX_MINIMUM_WAGE = 1500

function hasIncomeContext(text: string) {
  const normalized = text.toLowerCase()

  return [
    'renda',
    'salário',
    'salario',
    'ganha',
    'ganho',
    'recebe',
    'recebo',
    'bruta',
    'mensal',
    'compradores',
    'compor renda'
  ].some((word) => normalized.includes(word))
}

function hasNonIncomeContext(text: string) {
  const normalized = text.toLowerCase()

  return [
    'entrada',
    'sinal',
    'cpf',
    'nascimento',
    'nasceu',
    'data',
    'parcela',
    'documento',
    'opção',
    'opcao',
    'região',
    'regiao',
    'bairro'
  ].some((word) => normalized.includes(word))
}

function parseBrazilianMoneyToken(token: string) {
  const normalized = token
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/r\$/g, '')

  if (/^\d+[,.]?\d*k$/.test(normalized)) {
    const value = Number(normalized.replace('k', '').replace(',', '.'))
    return Number.isFinite(value) ? value * 1000 : null
  }

  if (/^\d+[,.]?\d*mil$/.test(normalized)) {
    const value = Number(normalized.replace('mil', '').replace(',', '.'))
    return Number.isFinite(value) ? value * 1000 : null
  }

  const onlyNumber = normalized.replace(/\./g, '').replace(',', '.')
  const parsed = Number(onlyNumber)

  if (!Number.isFinite(parsed)) return null

  if (parsed > 100000) return null

  if (parsed > 0 && parsed < 100 && !normalized.includes('.') && !normalized.includes(',')) {
    return parsed * 1000
  }

  return parsed
}

function detectIncomeFromText(text: string) {
  const normalized = text.toLowerCase()

  if (normalized.includes('salário mínimo') || normalized.includes('salario minimo')) {
    const spouseMatch = normalized.match(/(?:marido|esposa|mulher|companheiro|companheira).{0,20}?(\d+[,.]?\d*)\s*(mil|k)?/)
    const spouseValue = spouseMatch
      ? parseBrazilianMoneyToken(`${spouseMatch[1]}${spouseMatch[2] ?? ''}`)
      : null

    return APPROX_MINIMUM_WAGE + (spouseValue ?? 0)
  }

  const plusMatch = normalized.match(/(\d+[,.]?\d*)\s*(mil|k)?\s*\+\s*(\d+[,.]?\d*)\s*(mil|k)?/)
  if (plusMatch) {
    const first = parseBrazilianMoneyToken(`${plusMatch[1]}${plusMatch[2] ?? ''}`)
    const second = parseBrazilianMoneyToken(`${plusMatch[3]}${plusMatch[4] ?? ''}`)

    if (first && second) return first + second
  }

  const personIncomeMatches = [
    ...normalized.matchAll(
      /(?:eu|minha|meu|marido|esposa|mulher|companheiro|companheira|dele|dela).{0,20}?(\d+[,.]?\d*)\s*(mil|k)?/g
    )
  ]

  if (personIncomeMatches.length >= 2) {
    const values = personIncomeMatches
      .map((match) => parseBrazilianMoneyToken(`${match[1]}${match[2] ?? ''}`))
      .filter((value): value is number => Boolean(value))

    if (values.length >= 2) return values.reduce((sum, value) => sum + value, 0)
  }

  const moneyMatches = [
    ...normalized.matchAll(/(?:r\$?\s*)?(\d{1,3}(?:\.\d{3})+|\d+[,.]\d+|\d+)\s*(mil|k)?/g)
  ]

  const values = moneyMatches
    .map((match) => parseBrazilianMoneyToken(`${match[1]}${match[2] ?? ''}`))
    .filter((value): value is number => Boolean(value && value >= 1000 && value <= 100000))

  if (values.length === 0) return null

  if (values.length >= 2 && /esposa|marido|mulher|companheiro|companheira|somando|junto|mais|\+/.test(normalized)) {
    return values.reduce((sum, value) => sum + value, 0)
  }

  return values[0] ?? null
}

async function detectAndSaveIncome(params: {
  conversationId: string
  fields: ExtractableField[]
  orderedMessages: Array<{
    senderType: 'LEAD' | 'AGENT' | 'AI' | 'SYSTEM'
    content: string | null
    transcription: string | null
  }>
}) {
  const incomeField = params.fields.find((field) =>
    ['valor_renda_familiar', 'renda_familiar'].includes(field.key)
  )

  if (!incomeField) return null

  for (let index = params.orderedMessages.length - 1; index >= 0; index--) {
    const message = params.orderedMessages[index]
    if (message.senderType !== 'LEAD') continue

    const leadText = message.transcription?.trim() || message.content?.trim() || ''
    if (!leadText) continue

    const previous = params.orderedMessages[index - 1]
    const previousText = previous?.transcription?.trim() || previous?.content?.trim() || ''

    const contextText = `${previousText}\n${leadText}`

    const hasContext =
      hasIncomeContext(contextText) || hasIncomeContext(leadText)

    const blocked =
      hasNonIncomeContext(leadText) && !hasIncomeContext(contextText)

    if (!hasContext || blocked) continue

    const income = detectIncomeFromText(leadText)

    if (!income) continue

    const previousValue = await prisma.conversationFieldValue.findUnique({
      where: {
        conversationId_fieldId: {
          conversationId: params.conversationId,
          fieldId: incomeField.id
        }
      }
    })

    const displayValue = `R$ ${income.toLocaleString('pt-BR')}`

    const saved = await prisma.$transaction(async (tx) => {
      const value = await tx.conversationFieldValue.upsert({
        where: {
          conversationId_fieldId: {
            conversationId: params.conversationId,
            fieldId: incomeField.id
          }
        },
        update: {
          value: income,
          displayValue,
          source: 'AI',
          confidence: 0.95,
          evidence: leadText
        },
        create: {
          conversationId: params.conversationId,
          fieldId: incomeField.id,
          value: income,
          displayValue,
          source: 'AI',
          confidence: 0.95,
          evidence: leadText
        }
      })

      await tx.conversationFieldAuditLog.create({
        data: {
          conversationId: params.conversationId,
          fieldId: incomeField.id,
          oldValue: previousValue?.value ?? undefined,
          newValue: income,
          source: 'AI',
          evidence: leadText
        }
      })

      return value
    })

    return {
      key: incomeField.key,
      fieldId: incomeField.id,
      value: saved.value,
      displayValue: saved.displayValue,
      confidence: saved.confidence,
      evidence: saved.evidence
    }
  }

  return null
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

Você é um extrator especialista em CRM imobiliário brasileiro, com foco em pré-análise Minha Casa Minha Vida.

Você deve analisar a conversa completa, incluindo perguntas da IA, mensagens do atendente e respostas do lead, para interpretar corretamente o contexto.

Extraia SOMENTE os campos listados abaixo.

REGRAS GERAIS:
1. Extraia apenas campos existentes na lista.
2. Use exatamente a "key" do campo.
3. Nunca invente informação.
4. Se houver conflito, use a informação MAIS RECENTE da conversa.
5. Se não houver informação suficiente, ignore o campo.
6. Se nada puder ser extraído, retorne {"updates":[]}.
7. Retorne APENAS JSON válido, sem markdown, sem explicação e sem texto fora do JSON.

RENDA FAMILIAR / VALOR DA RENDA:
Use estas regras para campos como valor_renda_familiar, renda_familiar ou renda bruta mensal.

Interprete respostas brasileiras curtas dentro do contexto:
- Se a IA/pergunta anterior perguntou renda, “4” geralmente significa 4000.
- “4 mil” = 4000.
- “4k” = 4000.
- “4000” = 4000.
- “4.000” = 4000.
- “4,000” no Brasil geralmente = 4000.
- “8000k” provavelmente significa 8000, não 8.000.000.
- “8k” = 8000.
- “8 mil” = 8000.
- “2.500” = 2500.
- “2,500” = 2500.
- “2,5 mil” = 2500.
- “dois e meio” = 2500 quando contexto for renda.
- “minha 4 e da esposa 6” = 10000.
- “eu 2500 + esposa 2500” = 5000.
- “eu 2.500 e minha esposa 3.000” = 5500.
- “4+3” = 7000 quando o contexto for renda.
- “minha renda é 4 e a dela é 3” = 7000.
- “somando dá 5 mil” = 5000.
- “renda familiar 6 mil” = 6000.
- Se o lead informar renda de duas ou mais pessoas, some para renda familiar.
- Se o lead responder apenas a renda própria e não mencionar outra pessoa, use a renda informada como valor da renda familiar provisória.
- Se houver dúvida real se o número é renda, não extraia.

Não confunda tipo de renda com valor da renda.
- “formal”, “informal”, “mista”, “CLT”, “autônomo” são tipo_de_renda.
- “4000”, “4 mil”, “eu 2.500 + esposa 3.000” são valor_renda_familiar.

TIPO DE RENDA:
Use o campo tipo_de_renda quando existir.

Classifique como:
- formal: carteira assinada, CLT, registrado, contracheque, salário fixo registrado.
- informal: autônomo, bico, diária, comissão sem registro, renda informal, trabalha por conta.
- mista: quando houver parte formal e parte informal, ou duas pessoas com rendas de tipos diferentes.
- benefício: aposentadoria, pensão, BPC, benefício, bolsa família.

Exemplos:
- “sou CLT” → tipo_de_renda = formal.
- “sou autônomo” → tipo_de_renda = informal.
- “minha renda é registrada e minha esposa faz bico” → tipo_de_renda = mista.
- “um pouco formal e um pouco informal” → tipo_de_renda = mista.
- “recebo aposentadoria” → tipo_de_renda = benefício.

CPF:
Use o campo cpf_informado quando existir.
- Aceite CPF com pontos e traço.
- Aceite CPF apenas com números.
- Preserve o CPF encontrado.
- Se houver sequência clara de 11 dígitos, extraia como CPF.
- Não extraia telefone como CPF.
- Não invente.
- Se não houver CPF claro, ignore.

DATA DE NASCIMENTO:
Use o campo data_nascimento quando existir.
Interprete datas brasileiras:
- 04/10/1997
- 4-10-1997
- 04 10 1997
- 04101997
- 04/10/97
- “nasci em 1997” somente se o campo aceitar texto incompleto; se precisar data completa, ignore.
Quando a data completa estiver clara, prefira DD/MM/YYYY no displayValue.

NOME REAL:
Use o campo nome_real quando existir.
- Ignore apelidos religiosos, emojis e nomes fantasiosos.
- Aceite nomes humanos claros.
- Se o WhatsApp vier como “Borboletinha filha de Jesus”, ignore.
- Se o lead disser “meu nome é Maria Fernanda”, extraia Maria Fernanda.
- Se o atendente perguntar “com quem eu falo?” e o lead responder “João”, extraia João.

NOME LIMPO:
Use o campo nome_limpo quando existir.
Só preencha se houver confirmação clara:
- “nome limpo”, “CPF limpo”, “não tenho restrição”, “sem restrição”, “sem dívida”, “não estou negativado” → true.
- “nome sujo”, “tenho restrição”, “estou negativado”, “tenho dívida”, “SPC/Serasa” → false.

FGTS 3 ANOS:
Use o campo fgts_3_anos quando existir.
Considere true quando houver indício claro:
- “sim” como resposta direta à pergunta sobre 3 anos de carteira.
- “tenho mais de 3 anos de carteira”.
- “trabalhei registrado vários anos”.
- “somando dá mais de 36 meses”.
- “já tive carteira assinada por mais de 3 anos”.
Considere false quando o lead negar claramente:
- “não”, “nunca trabalhei registrado”, “menos de 3 anos”.

DEPENDENTE:
Use o campo possui_dependente quando existir.
Considere true quando:
- lead responde “sim” a uma pergunta sobre dependente.
- possui filho menor.
- possui dependente.
- casal vai financiar junto.
- duas pessoas vão compor renda no financiamento.
Considere false quando:
- responde “não” a pergunta de dependente.
- diz que vai financiar sozinho e sem filhos/dependentes.

ENTRADA:
Use o campo valor_entrada quando existir.
Interprete:
- “5 mil” = 5000.
- “tenho 10” = 10000 se o contexto for entrada.
- “consigo dar 3” = 3000 se o contexto for entrada.
- “entrada zero” = 0.
- “sem entrada” = 0.
- “não tenho entrada” = 0.

REGIÃO DE INTERESSE:
Use o campo regiao_interesse quando existir.
Extraia bairros, cidades, regiões e referências:
- Taquara
- Aparecida de Goiânia
- Jardim Novo Mundo
- perto do Flamboyant
- região do HUGO
- zona oeste
- Barra Olímpica
- Rio de Janeiro
- Goiânia

STATUS PRÉ-ANÁLISE:
Use o campo status_preanalise quando existir.
Interprete estágios como:
- iniciou
- respondeu renda
- CPF enviado
- aguardando documentos
- pré-análise concluída
- aguardando retorno
- desistiu
- sem resposta
- encaminhado para humano

FORMATO DE RESPOSTA:
Retorne APENAS JSON válido:

{
  "updates": [
    {
      "key": "valor_renda_familiar",
      "value": 5500,
      "displayValue": "R$ 5.500",
      "confidence": 0.92,
      "evidence": "eu 2.500 e minha esposa 3.000"
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
    const deterministicIncome = await detectAndSaveIncome({
  conversationId: params.conversationId,
  fields,
  orderedMessages
})

if (deterministicIncome) {
  const existingIndex = savedUpdates.findIndex(
    (item) => item.key === deterministicIncome.key
  )

  if (existingIndex >= 0) {
    savedUpdates[existingIndex] = deterministicIncome
  } else {
    savedUpdates.push(deterministicIncome)
  }
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