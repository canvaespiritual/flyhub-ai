'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createAiAgent,
  getAiAgent,
  getAiAgents,
  updateAiAgent,
  getCampaigns,
  linkAiAgentToCampaign
} from '@/lib/api'

const tabs = [
  'Identidade',
  'Fases',
  'Objeções',
  'Materiais',
  'Tabelas',
  'Follow-ups',
  'Exemplos',
  'Campanhas',
  'Prompt'
] as const

type Tab = (typeof tabs)[number]

function emptyAgent() {
  return {
    name: '',
    slug: '',
    description: '',
    isActive: true,
    model: 'gpt-4o-mini',
    temperature: 0.4,
    maxContextMessages: 12,
    objective: '',
    tone: '',
    basePrompt: '',
    businessRules: '',
    safetyRules: '',
    handoffRules: '',
    stages: [],
    objections: [],
    resources: [],
    knowledgeTables: [],
    followupRules: [],
    successExamples: []
  } as any
}

function Textarea(props: any) {
  return (
    <textarea
      {...props}
      className="min-h-28 w-full rounded-lg border border-neutral-700 bg-black p-3 text-sm text-white"
    />
  )
}

function Input(props: any) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-neutral-700 bg-black p-3 text-sm text-white"
    />
  )
}

export default function AiPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [agent, setAgent] = useState<any>(emptyAgent())
  const [tab, setTab] = useState<Tab>('Identidade')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const [loadedAgents, loadedCampaigns] = await Promise.all([
      getAiAgents(),
      getCampaigns()
    ])
    setAgents(loadedAgents)
    setCampaigns(loadedCampaigns)
    if (loadedAgents[0]?.id && !selectedId) {
      await selectAgent(loadedAgents[0].id)
    }
    setLoading(false)
  }

  async function selectAgent(id: string) {
    setSelectedId(id)
    const loaded = await getAiAgent(id)
    setAgent({
      ...emptyAgent(),
      ...loaded,
      stages: loaded.stages || [],
      objections: loaded.objections || [],
      resources: loaded.resources || [],
      knowledgeTables: loaded.knowledgeTables || [],
      followupRules: loaded.followupRules || [],
      successExamples: loaded.successExamples || []
    })
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateField(field: string, value: any) {
    setAgent((prev: any) => ({ ...prev, [field]: value }))
  }

  function updateArrayItem(arrayName: string, index: number, field: string, value: any) {
    setAgent((prev: any) => {
      const arr = [...(prev[arrayName] || [])]
      arr[index] = { ...arr[index], [field]: value }
      return { ...prev, [arrayName]: arr }
    })
  }

  function addItem(arrayName: string, item: any) {
    setAgent((prev: any) => ({
      ...prev,
      [arrayName]: [...(prev[arrayName] || []), item]
    }))
  }

  function removeItem(arrayName: string, index: number) {
    setAgent((prev: any) => ({
      ...prev,
      [arrayName]: (prev[arrayName] || []).filter((_: any, i: number) => i !== index)
    }))
  }

  async function save() {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      if (selectedId) {
        const updated = await updateAiAgent(selectedId, agent)
        await selectAgent(updated.id || selectedId)
      } else {
        const created = await createAiAgent(agent)
        await load()
        await selectAgent(created.id)
      }

      setSuccess('Agente IA salvo com sucesso.')
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar agente IA')
    } finally {
      setSaving(false)
    }
  }

  const linkedCampaignIds = useMemo(() => {
    return new Set(
      (agent.campaignConfigs || []).map((item: any) => item.campaignId || item.campaign?.id)
    )
  }, [agent])

  async function toggleCampaign(campaignId: string) {
    if (!selectedId) return

    const linked = linkedCampaignIds.has(campaignId)

    await linkAiAgentToCampaign({
      campaignId,
      agentId: linked ? null : selectedId
    })

    await selectAgent(selectedId)
  }

  const promptPreview = useMemo(() => {
    return JSON.stringify(
      {
        identidade: {
          nome: agent.name,
          objetivo: agent.objective,
          tom: agent.tone,
          basePrompt: agent.basePrompt,
          regrasNegocio: agent.businessRules,
          seguranca: agent.safetyRules,
          handoff: agent.handoffRules
        },
        fases: agent.stages,
        objeções: agent.objections,
        materiais: agent.resources,
        tabelas: agent.knowledgeTables,
        followups: agent.followupRules,
        exemplos: agent.successExamples
      },
      null,
      2
    )
  }, [agent])

  if (loading) {
    return <div className="p-6 text-white">Carregando IA...</div>
  }

  return (
    <div className="grid h-full grid-cols-[320px_1fr] gap-6 overflow-hidden bg-[#0b141a] p-6 text-white">
      <aside className="overflow-y-auto rounded-2xl border border-neutral-800 bg-[#111b21] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Agentes IA</h1>
          <button
            onClick={() => {
              setSelectedId(null)
              setAgent(emptyAgent())
              setTab('Identidade')
            }}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold"
          >
            Novo
          </button>
        </div>

        <div className="space-y-2">
          {agents.map((item) => (
            <button
              key={item.id}
              onClick={() => void selectAgent(item.id)}
              className={`w-full rounded-xl p-3 text-left transition ${
                selectedId === item.id ? 'bg-[#2a3942]' : 'bg-black hover:bg-[#202c33]'
              }`}
            >
              <div className="font-semibold">{item.name}</div>
              <div className="mt-1 text-xs text-neutral-400">
                {item.model} · {item.isActive ? 'ativo' : 'inativo'}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {item._count?.objections ?? 0} objeções · {item._count?.resources ?? 0} materiais
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#111b21]">
        <div className="border-b border-neutral-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">
                {selectedId ? agent.name || 'Agente IA' : 'Novo agente IA'}
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                Configure comportamento, fases, objeções, materiais, tabelas e follow-ups.
              </p>
            </div>

            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar agente'}
            </button>
          </div>

          {error && <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
          {success && <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</div>}

          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`rounded-full px-3 py-1 text-sm ${
                  tab === item ? 'bg-blue-600 text-white' : 'bg-black text-neutral-300'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[calc(100%-150px)] overflow-y-auto p-5">
          {tab === 'Identidade' && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">Nome</label>
                  <Input value={agent.name} onChange={(e: any) => updateField('name', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">Slug</label>
                  <Input value={agent.slug || ''} onChange={(e: any) => updateField('slug', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">Modelo</label>
                  <Input value={agent.model} onChange={(e: any) => updateField('model', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">Máx. mensagens contexto</label>
                  <Input type="number" value={agent.maxContextMessages} onChange={(e: any) => updateField('maxContextMessages', Number(e.target.value))} />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={agent.isActive} onChange={(e) => updateField('isActive', e.target.checked)} />
                Agente ativo
              </label>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Descrição</label>
                <Textarea value={agent.description || ''} onChange={(e: any) => updateField('description', e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Objetivo</label>
                <Textarea value={agent.objective || ''} onChange={(e: any) => updateField('objective', e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Tom da IA</label>
                <Textarea value={agent.tone || ''} onChange={(e: any) => updateField('tone', e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Prompt base</label>
                <Textarea value={agent.basePrompt || ''} onChange={(e: any) => updateField('basePrompt', e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Regras de negócio</label>
                <Textarea value={agent.businessRules || ''} onChange={(e: any) => updateField('businessRules', e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Regras de segurança</label>
                <Textarea value={agent.safetyRules || ''} onChange={(e: any) => updateField('safetyRules', e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Regras de handoff humano</label>
                <Textarea value={agent.handoffRules || ''} onChange={(e: any) => updateField('handoffRules', e.target.value)} />
              </div>
            </div>
          )}

          {tab === 'Fases' && (
            <ArrayEditor
              title="Fases do atendimento"
              items={agent.stages}
              add={() => addItem('stages', { name: '', order: agent.stages.length + 1, objective: '', instructions: '', isActive: true })}
              remove={(i: number) => removeItem('stages', i)}
              render={(item: any, i: number) => (
                <>
                  <Input placeholder="Nome da fase" value={item.name || ''} onChange={(e: any) => updateArrayItem('stages', i, 'name', e.target.value)} />
                  <Input type="number" placeholder="Ordem" value={item.order || 1} onChange={(e: any) => updateArrayItem('stages', i, 'order', Number(e.target.value))} />
                  <Textarea placeholder="Objetivo da fase" value={item.objective || ''} onChange={(e: any) => updateArrayItem('stages', i, 'objective', e.target.value)} />
                  <Textarea placeholder="Instruções para a IA nesta fase" value={item.instructions || ''} onChange={(e: any) => updateArrayItem('stages', i, 'instructions', e.target.value)} />
                </>
              )}
            />
          )}

          {tab === 'Objeções' && (
            <ArrayEditor
              title="Objeções"
              items={agent.objections}
              add={() => addItem('objections', { title: '', triggers: '', response: '', isActive: true })}
              remove={(i: number) => removeItem('objections', i)}
              render={(item: any, i: number) => (
                <>
                  <Input placeholder="Título da objeção" value={item.title || ''} onChange={(e: any) => updateArrayItem('objections', i, 'title', e.target.value)} />
                  <Textarea placeholder="Gatilhos/frases que indicam essa objeção" value={item.triggers || ''} onChange={(e: any) => updateArrayItem('objections', i, 'triggers', e.target.value)} />
                  <Textarea placeholder="Resposta/diretriz da IA" value={item.response || ''} onChange={(e: any) => updateArrayItem('objections', i, 'response', e.target.value)} />
                </>
              )}
            />
          )}

          {tab === 'Materiais' && (
            <ArrayEditor
              title="Materiais e recursos"
              items={agent.resources}
              add={() => addItem('resources', { type: 'LINK', title: '', url: '', description: '', isActive: true })}
              remove={(i: number) => removeItem('resources', i)}
              render={(item: any, i: number) => (
                <>
                  <select value={item.type} onChange={(e) => updateArrayItem('resources', i, 'type', e.target.value)} className="rounded-lg border border-neutral-700 bg-black p-3 text-sm text-white">
                    {['LINK', 'AUDIO', 'VIDEO', 'IMAGE', 'PDF', 'DOCUMENT', 'TEXT'].map((type) => <option key={type}>{type}</option>)}
                  </select>
                  <Input placeholder="Título" value={item.title || ''} onChange={(e: any) => updateArrayItem('resources', i, 'title', e.target.value)} />
                  <Input placeholder="URL/storage" value={item.url || ''} onChange={(e: any) => updateArrayItem('resources', i, 'url', e.target.value)} />
                  <Textarea placeholder="Descrição, propósito e quando usar" value={item.description || ''} onChange={(e: any) => updateArrayItem('resources', i, 'description', e.target.value)} />
                </>
              )}
            />
          )}

          {tab === 'Tabelas' && (
            <ArrayEditor
              title="Tabelas de consulta"
              items={agent.knowledgeTables}
              add={() => addItem('knowledgeTables', { name: '', type: 'SIMULATION', rows: [], isActive: true })}
              remove={(i: number) => removeItem('knowledgeTables', i)}
              render={(item: any, i: number) => (
                <>
                  <Input placeholder="Nome da tabela" value={item.name || ''} onChange={(e: any) => updateArrayItem('knowledgeTables', i, 'name', e.target.value)} />
                  <select value={item.type} onChange={(e) => updateArrayItem('knowledgeTables', i, 'type', e.target.value)} className="rounded-lg border border-neutral-700 bg-black p-3 text-sm text-white">
                    {['SIMULATION', 'DOCUMENTS', 'PRICING', 'FAQ', 'CUSTOM'].map((type) => <option key={type}>{type}</option>)}
                  </select>
                  <Textarea
                    placeholder='Linhas em JSON. Ex: [{"data":{"rendaMin":3000,"rendaMax":3500,"credito":"180k-210k"}}]'
                    value={JSON.stringify(item.rows || [], null, 2)}
                    onChange={(e: any) => {
                      try {
                        updateArrayItem('knowledgeTables', i, 'rows', JSON.parse(e.target.value || '[]'))
                      } catch {}
                    }}
                  />
                </>
              )}
            />
          )}

          {tab === 'Follow-ups' && (
            <ArrayEditor
              title="Follow-ups"
              items={agent.followupRules}
              add={() => addItem('followupRules', { delayMinutes: 10, message: '', windowType: 'SERVICE_24H', isActive: true })}
              remove={(i: number) => removeItem('followupRules', i)}
              render={(item: any, i: number) => (
                <>
                  <Input type="number" placeholder="Delay em minutos" value={item.delayMinutes || 10} onChange={(e: any) => updateArrayItem('followupRules', i, 'delayMinutes', Number(e.target.value))} />
                  <select value={item.windowType} onChange={(e) => updateArrayItem('followupRules', i, 'windowType', e.target.value)} className="rounded-lg border border-neutral-700 bg-black p-3 text-sm text-white">
                    <option value="SERVICE_24H">Janela 24h</option>
                    <option value="ENTRY_POINT_72H">Entrada anúncio 72h</option>
                    <option value="TEMPLATE_AFTER_WINDOW">Template após janela</option>
                  </select>
                  <Textarea placeholder="Mensagem do follow-up" value={item.message || ''} onChange={(e: any) => updateArrayItem('followupRules', i, 'message', e.target.value)} />
                </>
              )}
            />
          )}

          {tab === 'Exemplos' && (
            <ArrayEditor
              title="Conversas de sucesso"
              items={agent.successExamples}
              add={() => addItem('successExamples', { title: '', transcript: '', isActive: true })}
              remove={(i: number) => removeItem('successExamples', i)}
              render={(item: any, i: number) => (
                <>
                  <Input placeholder="Título/contexto" value={item.title || ''} onChange={(e: any) => updateArrayItem('successExamples', i, 'title', e.target.value)} />
                  <Textarea placeholder="Transcrição da conversa boa e motivo do sucesso" value={item.transcript || ''} onChange={(e: any) => updateArrayItem('successExamples', i, 'transcript', e.target.value)} />
                </>
              )}
            />
          )}

          {tab === 'Campanhas' && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Vincular agente às campanhas</h3>
              {!selectedId && <div className="text-sm text-neutral-400">Salve o agente antes de vincular campanhas.</div>}
              {campaigns.map((campaign) => (
                <label key={campaign.id} className="flex items-center justify-between rounded-xl border border-neutral-800 bg-black p-4">
                  <div>
                    <div className="font-semibold">{campaign.name}</div>
                    <div className="text-xs text-neutral-400">{campaign.fallbackText || 'Sem fallback'}</div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!selectedId}
                    checked={linkedCampaignIds.has(campaign.id)}
                    onChange={() => void toggleCampaign(campaign.id)}
                  />
                </label>
              ))}
            </div>
          )}

          {tab === 'Prompt' && (
            <pre className="whitespace-pre-wrap rounded-xl border border-neutral-800 bg-black p-4 text-xs text-neutral-200">
              {promptPreview}
            </pre>
          )}
        </div>
      </main>
    </div>
  )
}

function ArrayEditor({ title, items, add, remove, render }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <button onClick={add} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold">
          Adicionar
        </button>
      </div>

      {items?.length ? (
        <div className="space-y-4">
          {items.map((item: any, index: number) => (
            <div key={index} className="space-y-3 rounded-xl border border-neutral-800 bg-black p-4">
              {render(item, index)}
              <button onClick={() => remove(index)} className="text-sm text-red-400">
                Remover
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-black p-4 text-sm text-neutral-400">
          Nenhum item cadastrado ainda.
        </div>
      )}
    </div>
  )
}