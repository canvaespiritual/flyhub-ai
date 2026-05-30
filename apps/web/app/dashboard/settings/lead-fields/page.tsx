'use client'

import { useEffect, useState } from 'react'
import {
  createLeadField,
  deleteLeadField,
  getLeadFields,
  updateLeadField,
  type LeadFieldDefinition,
  type LeadFieldSourceMode,
  type LeadFieldType
} from '@/lib/api'

const fieldTypes: LeadFieldType[] = [
  'TEXT',
  'NUMBER',
  'MONEY',
  'BOOLEAN',
  'DATE',
  'SELECT',
  'MULTI_SELECT',
  'PHONE',
  'EMAIL',
  'URL',
  'JSON'
]

const sourceModes: LeadFieldSourceMode[] = [
  'SYSTEM',
  'AI',
  'HUMAN',
  'AI_HUMAN',
  'SYSTEM_HUMAN'
]

const emptyForm = {
  key: '',
  label: '',
  description: '',
  type: 'TEXT' as LeadFieldType,
  sourceMode: 'HUMAN' as LeadFieldSourceMode,
  order: 0,
  isVisibleOnCard: true,
  isFilterable: true,
  isSensitive: false,
  aiExtractable: false
}

export default function LeadFieldsSettingsPage() {
  const [fields, setFields] = useState<LeadFieldDefinition[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadFields() {
    setLoading(true)
    setError(null)

    try {
      const data = await getLeadFields()
      setFields(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar campos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFields()
  }, [])

  function startEdit(field: LeadFieldDefinition) {
    setEditingId(field.id)
    setForm({
      key: field.key,
      label: field.label,
      description: field.description ?? '',
      type: field.type,
      sourceMode: field.sourceMode,
      order: field.order,
      isVisibleOnCard: field.isVisibleOnCard,
      isFilterable: field.isFilterable,
      isSensitive: field.isSensitive,
      aiExtractable: field.aiExtractable
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const payload = {
        key: form.key,
        label: form.label,
        description: form.description || null,
        type: form.type,
        sourceMode: form.sourceMode,
        order: form.order,
        isVisibleOnCard: form.isVisibleOnCard,
        isFilterable: form.isFilterable,
        isSensitive: form.isSensitive,
        aiExtractable: form.aiExtractable
      }

      if (editingId) {
        await updateLeadField(editingId, payload)
      } else {
        await createLeadField(payload)
      }

      resetForm()
      await loadFields()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar campo')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable(field: LeadFieldDefinition) {
    const ok = confirm(`Desativar o campo "${field.label}"?`)
    if (!ok) return

    try {
      await deleteLeadField(field.id)
      await loadFields()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desativar campo')
    }
  }

    return (
    <main className="h-screen overflow-y-auto bg-[#0b141a] p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Campos do Lead</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Configure os campos dinâmicos da ficha do lead para esta operação.
            </p>
          </div>

          <a
            href="/dashboard/settings"
            className="w-fit rounded-lg bg-[#202c33] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a3942]"
          >
            Voltar
          </a>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-neutral-800 bg-[#111b21] p-4">
          <h2 className="mb-4 text-lg font-medium">
            {editingId ? 'Editar campo' : 'Novo campo'}
          </h2>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-neutral-300">Chave</span>
              <input
                value={form.key}
                onChange={(e) => setForm((old) => ({ ...old, key: e.target.value }))}
                placeholder="ex: renda_familiar"
                className="w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
                required
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-neutral-300">Nome visível</span>
              <input
                value={form.label}
                onChange={(e) => setForm((old) => ({ ...old, label: e.target.value }))}
                placeholder="ex: Renda familiar"
                className="w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
                required
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-neutral-300">Tipo</span>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((old) => ({ ...old, type: e.target.value as LeadFieldType }))
                }
                className="w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
              >
                {fieldTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-neutral-300">Fonte</span>
              <select
                value={form.sourceMode}
                onChange={(e) =>
                  setForm((old) => ({
                    ...old,
                    sourceMode: e.target.value as LeadFieldSourceMode
                  }))
                }
                className="w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
              >
                {sourceModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-neutral-300">Ordem</span>
              <input
                type="number"
                value={form.order}
                onChange={(e) =>
                  setForm((old) => ({ ...old, order: Number(e.target.value) }))
                }
                className="w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
              />
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-neutral-300">Descrição</span>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((old) => ({ ...old, description: e.target.value }))
                }
                className="min-h-20 w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
              />
            </label>

            <div className="grid gap-3 text-sm md:col-span-2 md:grid-cols-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isVisibleOnCard}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, isVisibleOnCard: e.target.checked }))
                  }
                />
                Aparece no card
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isFilterable}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, isFilterable: e.target.checked }))
                  }
                />
                Filtrável
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.aiExtractable}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, aiExtractable: e.target.checked }))
                  }
                />
                IA pode extrair
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isSensitive}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, isSensitive: e.target.checked }))
                  }
                />
                Sensível
              </label>
            </div>

            <div className="flex gap-2 md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#25d366] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar campo'}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg bg-[#202c33] px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-[#111b21] p-4">
          <h2 className="mb-4 text-lg font-medium">Campos cadastrados</h2>

          {loading ? (
            <p className="text-sm text-neutral-400">Carregando...</p>
          ) : fields.length === 0 ? (
            <p className="text-sm text-neutral-400">Nenhum campo cadastrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="py-2">Ordem</th>
                    <th className="py-2">Nome</th>
                    <th className="py-2">Chave</th>
                    <th className="py-2">Tipo</th>
                    <th className="py-2">Fonte</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {fields.map((field) => (
                    <tr key={field.id} className="border-t border-neutral-800">
                      <td className="py-3">{field.order}</td>
                      <td className="py-3">{field.label}</td>
                      <td className="py-3 text-neutral-400">{field.key}</td>
                      <td className="py-3">{field.type}</td>
                      <td className="py-3">{field.sourceMode}</td>
                      <td className="py-3">
                        {field.isActive ? 'Ativo' : 'Inativo'}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(field)}
                          className="mr-3 text-[#53bdeb] hover:underline"
                        >
                          Editar
                        </button>

                        {field.isActive && (
                          <button
                            type="button"
                            onClick={() => handleDisable(field)}
                            className="text-red-400 hover:underline"
                          >
                            Desativar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}