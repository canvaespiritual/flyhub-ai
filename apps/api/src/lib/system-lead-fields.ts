import { prisma } from './prisma.js'

function toDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function upsertSystemField(params: {
  conversationId: string
  fieldId: string
  value: unknown
}) {
  const displayValue = toDisplayValue(params.value)

  if (displayValue === null) return null

  const previous = await prisma.conversationFieldValue.findUnique({
    where: {
      conversationId_fieldId: {
        conversationId: params.conversationId,
        fieldId: params.fieldId
      }
    }
  })

  const saved = await prisma.$transaction(async (tx) => {
    const value = await tx.conversationFieldValue.upsert({
      where: {
        conversationId_fieldId: {
          conversationId: params.conversationId,
          fieldId: params.fieldId
        }
      },
      update: {
        value: params.value as any,
        displayValue,
        source: 'SYSTEM'
      },
      create: {
        conversationId: params.conversationId,
        fieldId: params.fieldId,
        value: params.value as any,
        displayValue,
        source: 'SYSTEM'
      }
    })

    await tx.conversationFieldAuditLog.create({
      data: {
        conversationId: params.conversationId,
        fieldId: params.fieldId,
        oldValue: previous?.value ?? undefined,
        newValue: params.value as any,
        source: 'SYSTEM'
      }
    })

    return value
  })

  return saved
}

export async function syncSystemLeadFields(params: {
  tenantId: string
  conversationId: string
}) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      tenantId: params.tenantId
    },
    include: {
      contact: true,
      campaign: true,
      phoneNumber: true,
      assignedUser: true,
      manager: true
    }
  })

  if (!conversation) {
    return {
      status: 'SKIPPED' as const,
      reason: 'Conversa não encontrada',
      synced: []
    }
  }

  const fields = await prisma.leadFieldDefinition.findMany({
    where: {
      tenantId: params.tenantId,
      isActive: true,
      sourceMode: {
        in: ['SYSTEM', 'SYSTEM_HUMAN']
      }
    }
  })

  const fieldByKey = new Map(fields.map((field) => [field.key, field]))

  const systemValues: Record<string, unknown> = {
    nome_whatsapp: conversation.contact.name,
    telefone: conversation.contact.phone,
    campanha_origem: conversation.campaign?.name ?? null,
    campanha_id: conversation.campaignId ?? null,
    campanha_ref: conversation.campaign?.ref ?? null,
    meta_ad_id: conversation.campaign?.metaAdId ?? null,
    fallback_text: conversation.campaign?.fallbackText ?? null,
    linha: conversation.phoneNumber.label ?? conversation.phoneNumber.number,
    numero_linha: conversation.phoneNumber.number,
    responsavel: conversation.assignedUser?.name ?? null,
    gerente: conversation.manager?.name ?? null,
    data_entrada: conversation.createdAt,
    data_ultima_mensagem: conversation.lastMessageAt,
    status_conversa: conversation.status,
    modo_conversa: conversation.mode
  }

  const synced = []

  for (const [key, value] of Object.entries(systemValues)) {
    const field = fieldByKey.get(key)

    if (!field) continue

    const saved = await upsertSystemField({
      conversationId: conversation.id,
      fieldId: field.id,
      value
    })

    if (saved) {
      synced.push({
        key,
        value: saved.value,
        displayValue: saved.displayValue
      })
    }
  }

  return {
    status: 'SUCCESS' as const,
    synced
  }
}