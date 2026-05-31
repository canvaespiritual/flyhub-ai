'use client'

import { useEffect, useState } from 'react'
import { getOperationSummary, type OperationSummary } from '@/lib/api'

export default function ReportsPage() {
    const [data, setData] = useState<OperationSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [assignedUserId, setAssignedUserId] = useState('')

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const summary = await getOperationSummary({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    assignedUserId: assignedUserId || undefined
    })
      setData(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatório')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  return (
    <main className="h-screen overflow-y-auto bg-[#0b141a] p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6 pb-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Relatórios da Operação</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Visão dinâmica baseada nos campos configurados do lead.
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/dashboard/settings"
              className="rounded-lg bg-[#202c33] px-4 py-2 text-sm hover:bg-[#2a3942]"
            >
              Voltar
            </a>

            <button
              type="button"
              onClick={loadData}
              className="rounded-lg bg-[#25d366] px-4 py-2 text-sm font-semibold text-black"
            >
              Atualizar
            </button>
          </div>
        </div>
        {data && (
  <section className="rounded-2xl border border-neutral-800 bg-[#111b21] p-4">
    <div className="grid gap-3 md:grid-cols-4">
      <label className="space-y-1 text-sm">
        <span className="text-neutral-400">Data inicial</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-neutral-400">Data final</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-neutral-400">Corretor</span>
        <select
          value={assignedUserId}
          onChange={(e) => setAssignedUserId(e.target.value)}
          className="w-full rounded-lg bg-[#202c33] px-3 py-2 outline-none"
        >
          <option value="">Todos</option>
          {data.byAgent.map((agent) => (
            <option key={agent.id ?? agent.name} value={agent.id ?? ''}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={loadData}
          className="rounded-lg bg-[#25d366] px-4 py-2 text-sm font-semibold text-black"
        >
          Aplicar
        </button>

        <button
          type="button"
          onClick={() => {
            setDateFrom('')
            setDateTo('')
            setAssignedUserId('')
            setTimeout(() => void loadData(), 0)
          }}
          className="rounded-lg bg-[#202c33] px-4 py-2 text-sm hover:bg-[#2a3942]"
        >
          Limpar
        </button>
      </div>
    </div>
  </section>
)}
        {loading && <p className="text-sm text-neutral-400">Carregando...</p>}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
                <p className="text-sm text-neutral-400">Total de leads</p>
                <p className="mt-2 text-3xl font-semibold">{data.totalLeads}</p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
                <p className="text-sm text-neutral-400">Corretores com leads</p>
                <p className="mt-2 text-3xl font-semibold">{data.byAgent.length}</p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
                <p className="text-sm text-neutral-400">Campanhas com leads</p>
                <p className="mt-2 text-3xl font-semibold">{data.byCampaign.length}</p>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
                <h2 className="mb-4 text-lg font-semibold">Leads por corretor</h2>

                <div className="space-y-3">
                  {data.byAgent.map((item) => (
                    <div key={item.name}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{item.name}</span>
                        <span className="text-neutral-400">{item.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#202c33]">
                        <div
                          className="h-2 rounded-full bg-[#25d366]"
                          style={{
                            width: `${data.totalLeads ? (item.total / data.totalLeads) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
                <h2 className="mb-4 text-lg font-semibold">Leads por campanha</h2>

                <div className="space-y-3">
                  {data.byCampaign.map((item) => (
                    <div key={item.name}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{item.name}</span>
                        <span className="text-neutral-400">{item.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#202c33]">
                        <div
                          className="h-2 rounded-full bg-[#53bdeb]"
                          style={{
                            width: `${data.totalLeads ? (item.total / data.totalLeads) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
              <h2 className="mb-4 text-lg font-semibold">Campos preenchidos</h2>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.fields.map((field) => {
                  const total = field.filled + field.empty
                  const percent = total ? Math.round((field.filled / total) * 100) : 0

                  return (
                    <div
                      key={field.fieldId}
                      className="rounded-xl border border-neutral-800 bg-[#0b141a] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium">{field.label}</h3>
                          <p className="text-xs text-neutral-500">{field.key}</p>
                        </div>

                        <span className="rounded-full bg-[#202c33] px-2 py-1 text-xs">
                          {percent}%
                        </span>
                      </div>

                      <div className="mt-3 h-2 rounded-full bg-[#202c33]">
                        <div
                          className="h-2 rounded-full bg-[#25d366]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-[#111b21] p-2">
                          <p className="text-neutral-400">Preenchido</p>
                          <p className="text-lg font-semibold">{field.filled}</p>
                        </div>

                        <div className="rounded-lg bg-[#111b21] p-2">
                          <p className="text-neutral-400">Vazio</p>
                          <p className="text-lg font-semibold">{field.empty}</p>
                        </div>
                      </div>

                      {field.values.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-medium text-neutral-400">
                            Valores mais comuns
                          </p>

                          <div className="space-y-1">
                            {field.values.slice(0, 5).map((value) => (
                              <div
                                key={`${field.fieldId}-${value.label}`}
                                className="flex justify-between gap-2 text-xs"
                              >
                                <span className="truncate text-neutral-300">
                                  {value.label}
                                </span>
                                <span className="text-neutral-500">{value.total}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}