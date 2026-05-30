import { useEffect, useMemo, useState } from 'react'
import type { Lead } from '@flyhub/shared'
import {
  getConversationFieldValues,
  updateConversationFieldValue,
  extractLeadFromConversation,
  type ConversationFieldEntry
} from '@/lib/api'

type Props = {
  lead: Lead
  conversationId: string
}

function normalizePhoneForWhatsApp(phone?: string) {
  if (!phone) return ''

  let digits = phone.replace(/\D/g, '')

  if (digits.startsWith('55') && digits.length === 12) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4)
  }

  return digits
}

function formatPhone(phone?: string) {
  if (!phone) return '—'

  const digits = normalizePhoneForWhatsApp(phone)

  if (digits.startsWith('55') && digits.length === 13) {
    const country = digits.slice(0, 2)
    const ddd = digits.slice(2, 4)
    const first = digits.slice(4, 9)
    const second = digits.slice(9)
    return `+${country} (${ddd}) ${first}-${second}`
  }

  if (digits.startsWith('55') && digits.length === 12) {
    const country = digits.slice(0, 2)
    const ddd = digits.slice(2, 4)
    const first = digits.slice(4, 8)
    const second = digits.slice(8)
    return `+${country} (${ddd}) ${first}-${second}`
  }

  return phone
}

function formatFieldValue(entry: ConversationFieldEntry) {
  if (entry.value?.displayValue) return entry.value.displayValue

  const rawValue = entry.value?.value

  if (rawValue === null || rawValue === undefined) return '—'
  if (typeof rawValue === 'string') return rawValue
  if (typeof rawValue === 'number') return String(rawValue)
  if (typeof rawValue === 'boolean') return rawValue ? 'Sim' : 'Não'

  try {
    return JSON.stringify(rawValue)
  } catch {
    return String(rawValue)
  }
}

function getInputType(type: ConversationFieldEntry['field']['type']) {
  if (type === 'NUMBER' || type === 'MONEY') return 'number'
  if (type === 'DATE') return 'date'
  if (type === 'EMAIL') return 'email'
  if (type === 'PHONE') return 'tel'
  if (type === 'URL') return 'url'
  return 'text'
}

function canEditField(entry: ConversationFieldEntry) {
  return entry.field.sourceMode !== 'SYSTEM'
}
function buildLeadSummary(
  lead: Lead,
  formattedPhone: string,
  entries: ConversationFieldEntry[]
) {
  const lines = [
    '📋 RESUMO DO LEAD',
    '',
    `Nome WhatsApp: ${lead.name}`,
    `Telefone: ${formattedPhone}`,
    `Email: ${lead.email || '—'}`,
    ''
  ]

  for (const entry of entries) {
    if (!entry.field.isVisibleOnCard) continue

    const value = formatFieldValue(entry)

    lines.push(`${entry.field.label}: ${value}`)
  }

  return lines.join('\n')
}
export function LeadSidebar({ lead, conversationId }: Props) {
  const [entries, setEntries] = useState<ConversationFieldEntry[]>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [extracting, setExtracting] = useState(false)

  const waPhone = normalizePhoneForWhatsApp(lead.phone)
  const waLink = waPhone ? `https://wa.me/${waPhone}` : null
  const formattedPhone = formatPhone(lead.phone)
  async function copyLeadSummary() {
  try {
    const summary = buildLeadSummary(
      lead,
      formattedPhone,
      visibleEntries
    )

    await navigator.clipboard.writeText(summary)

    alert('Resumo copiado ✓')
  } catch (error) {
    console.error(error)
    alert('Erro ao copiar resumo')
  }
}

async function runExtractor() {
  try {
    setExtracting(true)

    const result = await extractLeadFromConversation(conversationId)

    console.log('[LEAD_EXTRACTOR_RESULT]', result)

    await loadFields()

    alert('Extração concluída ✓')
  } catch (error) {
    console.error(error)
    alert(error instanceof Error ? error.message : 'Erro ao rodar extrator')
  } finally {
    setExtracting(false)
  }
}

  const visibleEntries = useMemo(() => {
    return entries.filter((entry) => entry.field.isActive && entry.field.isVisibleOnCard)
  }, [entries])

  async function loadFields() {
    setLoadingFields(true)

    try {
      const data = await getConversationFieldValues(conversationId)
      setEntries(data)
    } catch (error) {
      console.error('Erro ao carregar ficha do lead:', error)
    } finally {
      setLoadingFields(false)
    }
  }

  useEffect(() => {
    void loadFields()
  }, [conversationId])

  function startEdit(entry: ConversationFieldEntry) {
    setEditingFieldId(entry.field.id)
    setDraftValue(formatFieldValue(entry) === '—' ? '' : formatFieldValue(entry))
  }

  function cancelEdit() {
    setEditingFieldId(null)
    setDraftValue('')
  }

  async function saveField(entry: ConversationFieldEntry) {
    try {
      setSavingFieldId(entry.field.id)

      let value: unknown = draftValue

      if (entry.field.type === 'NUMBER' || entry.field.type === 'MONEY') {
        value = draftValue.trim() ? Number(draftValue) : null
      }

      if (entry.field.type === 'BOOLEAN') {
        value = draftValue === 'true'
      }

      await updateConversationFieldValue(conversationId, entry.field.id, {
        value,
        displayValue: draftValue.trim() || null,
        source: 'HUMAN'
      })

      cancelEdit()
      await loadFields()
    } catch (error) {
      console.error('Erro ao salvar campo:', error)
      alert(error instanceof Error ? error.message : 'Erro ao salvar campo')
    } finally {
      setSavingFieldId(null)
    }
  }

  return (
  <aside className="flex h-full min-h-0 flex-col border-l border-neutral-800 bg-[#111b21] text-white">
      <div className="border-b border-neutral-800 p-4">
        <h3 className="text-lg">Lead</h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="space-y-2 text-sm">
        <p>
          <span className="text-neutral-400">Nome:</span> {lead.name}
        </p>

        <p>
          <span className="text-neutral-400">Telefone:</span>{' '}
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="text-[#53bdeb] underline underline-offset-2 hover:text-[#7fd4f7]"
              title="Abrir conversa no WhatsApp"
            >
              {formattedPhone}
            </a>
          ) : (
            formattedPhone
          )}
        </p>

        <p>
          <span className="text-neutral-400">Email:</span> {lead.email || '—'}
        </p>
      </div>

      <div className="my-4 border-t border-neutral-800" />

      <div className="mb-3 flex items-center justify-between">
  <h4 className="text-sm font-semibold">Ficha do Lead</h4>

  <div className="flex items-center gap-3">
    <button
      type="button"
      onClick={copyLeadSummary}
      title="Copiar resumo do lead"
      className="text-sm hover:opacity-80"
    >
      📋
    </button>
          <button
  type="button"
  onClick={runExtractor}
  disabled={extracting}
  title="Rodar extrator de dados"
  className="text-sm hover:opacity-80 disabled:opacity-40"
>
  {extracting ? '…' : '✨'}
</button>
    <button
      type="button"
      onClick={loadFields}
      className="text-xs text-[#53bdeb] hover:underline"
    >
      Atualizar
    </button>
  </div>
</div>
         
  
      {loadingFields ? (
        <p className="text-sm text-neutral-400">Carregando ficha...</p>
      ) : visibleEntries.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhum campo configurado para este card.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleEntries.map((entry) => {
            const isEditing = editingFieldId === entry.field.id
            const isSaving = savingFieldId === entry.field.id
            const editable = canEditField(entry)

            return (
              <div
                key={entry.field.id}
                className="rounded-xl border border-neutral-800 bg-[#0b141a] p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-neutral-400">{entry.field.label}</span>

                  {editable && !isEditing && (
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      className="text-[11px] text-[#53bdeb] hover:underline"
                    >
                      editar
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    {entry.field.type === 'BOOLEAN' ? (
                      <select
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        className="w-full rounded-lg bg-[#202c33] px-2 py-2 text-sm outline-none"
                      >
                        <option value="">—</option>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                      </select>
                    ) : (
                      <input
                        type={getInputType(entry.field.type)}
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        className="w-full rounded-lg bg-[#202c33] px-2 py-2 text-sm outline-none"
                      />
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => saveField(entry)}
                        className="rounded-md bg-[#25d366] px-3 py-1 text-xs font-semibold text-black disabled:opacity-60"
                      >
                        {isSaving ? 'Salvando...' : 'Salvar'}
                      </button>

                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-md bg-[#202c33] px-3 py-1 text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="break-words text-sm">{formatFieldValue(entry)}</p>
                )}

                {entry.value?.source && (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Fonte: {entry.value.source}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
       </div>
    </aside>
  )
}