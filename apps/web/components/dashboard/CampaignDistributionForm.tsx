'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getCampaigns,
  getUsers,
  getCampaignDistribution,
  updateCampaignDistribution
} from '@/lib/api'

type CampaignDistributionFormProps = {
  campaignId: string
}

type Campaign = {
  id: string
  name: string
  managerId?: string
  manager?: {
    id: string
    name: string
    email: string
  }
}

type User = {
  id: string
  name: string
  email: string
  role: 'master' | 'admin' | 'manager' | 'agent'
  managerId?: string
  isActive: boolean
}

type DistributionMember = {
  userId: string
  sortOrder: number
  isActive?: boolean
  user?: {
    id: string
    name: string
    email: string
  }
}

type DistributionMode =
  | 'ROUND_ROBIN'
  | 'ORDERED_QUEUE'
  | 'MANUAL_ONLY'
  | 'QUEUE_WITH_TIMEOUT'

type DistributionRule = {
  id: string
  campaignId: string
  managerId: string
  mode: DistributionMode
  isActive: boolean
  reassignOnTimeout: boolean
  responseTimeoutSeconds: number
  viewTimeoutSeconds?: number | null
  onlyBusinessHours: boolean
  members: DistributionMember[]
}

export default function CampaignDistributionForm({
  campaignId
}: CampaignDistributionFormProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [allUsers, setAllUsers] = useState<User[]>([])

  const [mode, setMode] = useState<DistributionMode>('ROUND_ROBIN')
  const [reassignOnTimeout, setReassignOnTimeout] = useState(false)
  const [responseTimeoutSeconds, setResponseTimeoutSeconds] = useState(300)
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])

  useEffect(() => {
    void load()
  }, [campaignId])

  async function load() {
    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const [campaigns, users, distribution] = await Promise.all([
        getCampaigns(),
        getUsers({ status: 'active' }),
        getCampaignDistribution(campaignId)
      ])

      const foundCampaign =
        campaigns.find((item: Campaign) => item.id === campaignId) || null

      setCampaign(foundCampaign)
      setAllUsers(users || [])

      if (distribution) {
        const rule = distribution as DistributionRule

        setMode(rule.mode)
        setReassignOnTimeout(rule.reassignOnTimeout)
        setResponseTimeoutSeconds(rule.responseTimeoutSeconds)
        setSelectedAgentIds(
          [...(rule.members || [])]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((member) => member.userId)
        )
      } else {
        setMode('ROUND_ROBIN')
        setReassignOnTimeout(false)
        setResponseTimeoutSeconds(300)
        setSelectedAgentIds([])
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar distribuição')
    } finally {
      setLoading(false)
    }
  }

  const manager = useMemo(() => {
    if (!campaign?.managerId) return null

    const managerFromUsers = allUsers.find(
      (user) => user.id === campaign.managerId && user.role === 'manager'
    )

    if (managerFromUsers) {
      return {
        id: managerFromUsers.id,
        name: managerFromUsers.name,
        email: managerFromUsers.email
      }
    }

    return campaign.manager || null
  }, [campaign, allUsers])

  const managerAgents = useMemo(() => {
    if (!campaign?.managerId) return []

    return allUsers.filter(
      (user) =>
        user.role === 'agent' &&
        user.isActive &&
        user.managerId === campaign.managerId
    )
  }, [allUsers, campaign])

  const usesTimeoutQueue = mode === 'QUEUE_WITH_TIMEOUT'
  const requiresMembers = mode !== 'MANUAL_ONLY'

  function toggleAgent(userId: string) {
    setSelectedAgentIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId)
      }

      return [...prev, userId]
    })
  }

  function moveAgentUp(userId: string) {
    setSelectedAgentIds((prev) => {
      const index = prev.indexOf(userId)
      if (index <= 0) return prev

      const updated = [...prev]
      ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
      return updated
    })
  }

  function moveAgentDown(userId: string) {
    setSelectedAgentIds((prev) => {
      const index = prev.indexOf(userId)
      if (index === -1 || index >= prev.length - 1) return prev

      const updated = [...prev]
      ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
      return updated
    })
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      if (!campaign?.managerId) {
        setError('Essa campanha precisa ter um manager definido antes da distribuição.')
        return
      }

      if (requiresMembers && selectedAgentIds.length === 0) {
        setError('Selecione pelo menos um atendente para essa distribuição.')
        return
      }

      if (usesTimeoutQueue && responseTimeoutSeconds < 10) {
        setError('O tempo de resposta deve ser de pelo menos 10 segundos.')
        return
      }

      await updateCampaignDistribution(campaignId, {
        mode,
        reassignOnTimeout: usesTimeoutQueue ? reassignOnTimeout : false,
        responseTimeoutSeconds: usesTimeoutQueue ? responseTimeoutSeconds : 300,
        members: selectedAgentIds.map((userId, index) => ({
          userId,
          sortOrder: index + 1
        }))
      })

      setSuccess('Distribuição salva com sucesso.')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar distribuição')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-neutral-400">Carregando configuração de distribuição...</div>
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <h2 className="text-xl font-semibold">Configuração de Distribuição</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Defina a lógica operacional da campanha selecionada.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-[#0b141a] p-4">
          <div className="text-sm text-neutral-400">Campanha</div>
          <div className="mt-1 text-base font-medium text-white">
            {campaign?.name || 'Campanha não encontrada'}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-[#0b141a] p-4">
          <div className="text-sm text-neutral-400">Manager responsável</div>
          <div className="mt-1 text-base font-medium text-white">
            {manager?.name || 'Sem manager definido'}
          </div>
          {manager?.email && (
            <div className="mt-1 text-sm text-neutral-400">{manager.email}</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-[#0b141a] p-4">
        <label className="mb-2 block text-sm font-medium text-neutral-300">
          Modo de distribuição
        </label>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as DistributionMode)}
          className="w-full rounded-lg border border-neutral-700 bg-black p-3 text-white"
        >
          <option value="ROUND_ROBIN">Round Robin</option>
          <option value="ORDERED_QUEUE">Fila Ordenada</option>
          <option value="MANUAL_ONLY">Manual Only</option>
          <option value="QUEUE_WITH_TIMEOUT">Fila com timeout</option>
        </select>

        <div className="mt-3 text-xs text-neutral-400">
          {mode === 'ROUND_ROBIN' &&
            'A conversa já nasce atribuída e alterna entre os atendentes selecionados.'}
          {mode === 'ORDERED_QUEUE' &&
            'A conversa já nasce atribuída respeitando a ordem fixa dos atendentes selecionados.'}
          {mode === 'MANUAL_ONLY' &&
            'A conversa não nasce atribuída. A equipe assume manualmente.'}
          {mode === 'QUEUE_WITH_TIMEOUT' &&
            'A conversa entra em fila por janela de tempo, passando para o próximo se expirar.'}
        </div>
      </div>

      {usesTimeoutQueue && (
        <div className="rounded-xl border border-neutral-800 bg-[#0b141a] p-4 space-y-4">
          <label className="flex items-center gap-3 text-sm text-white">
            <input
              type="checkbox"
              checked={reassignOnTimeout}
              onChange={(e) => setReassignOnTimeout(e.target.checked)}
            />
            Redistribuir automaticamente por timeout
          </label>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-300">
              Tempo da janela (segundos)
            </label>
            <input
              type="number"
              min={10}
              max={86400}
              value={responseTimeoutSeconds}
              onChange={(e) => setResponseTimeoutSeconds(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-700 bg-black p-3 text-white"
            />
            <div className="mt-2 text-xs text-neutral-400">
              Essa janela só vale para o modo de fila com timeout.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-neutral-800 bg-[#0b141a] p-4">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-white">Atendentes da gerência</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Só aparecem agents vinculados ao manager desta campanha.
          </p>
        </div>

        {managerAgents.length === 0 ? (
          <div className="text-sm text-neutral-400">
            Nenhum atendente ativo encontrado para esse manager.
          </div>
        ) : (
          <div className="space-y-3">
            {managerAgents.map((agent) => {
              const selected = selectedAgentIds.includes(agent.id)
              const orderIndex = selectedAgentIds.indexOf(agent.id)

              return (
                <div
                  key={agent.id}
                  className="rounded-lg border border-neutral-800 bg-black p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleAgent(agent.id)}
                      />
                      <div>
                        <div className="text-sm font-medium text-white">{agent.name}</div>
                        <div className="text-xs text-neutral-400">{agent.email}</div>
                      </div>
                    </label>

                    {selected && (
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                          Ordem {orderIndex + 1}
                        </span>

                        <button
                          type="button"
                          onClick={() => moveAgentUp(agent.id)}
                          className="rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700"
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={() => moveAgentDown(agent.id)}
                          className="rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700"
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? 'Salvando...' : 'Salvar distribuição'}
        </button>
      </div>
    </div>
  )
}