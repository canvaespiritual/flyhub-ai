'use client'

import { useEffect, useState } from 'react'
import { getCampaignDistribution, updateCampaignDistribution, getUsers } from '@/lib/api'

export default function CampaignDistributionForm({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])

  const [mode, setMode] = useState('ROUND_ROBIN')
  const [timeout, setTimeoutValue] = useState(300)
  const [reassign, setReassign] = useState(false)

  async function load() {
    setLoading(true)

    const [rule, usersList] = await Promise.all([
      getCampaignDistribution(campaignId),
      getUsers()
    ])

    setUsers(usersList.filter((u: any) => u.role === 'agent'))

    if (rule) {
      setMode(rule.mode)
      setTimeoutValue(rule.responseTimeoutSeconds)
      setReassign(rule.reassignOnTimeout)
      setMembers(rule.members || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [campaignId])

  async function handleSave() {
    await updateCampaignDistribution(campaignId, {
      mode,
      responseTimeoutSeconds: timeout,
      reassignOnTimeout: reassign,
      members: members.map((m: any, i: number) => ({
        userId: m.userId || m.id,
        sortOrder: i + 1
      }))
    })

    alert('Salvo!')
  }

  function addMember(user: any) {
    if (members.some(m => (m.userId || m.id) === user.id)) return
    setMembers([...members, user])
  }

  function removeMember(id: string) {
    setMembers(members.filter(m => (m.userId || m.id) !== id))
  }

  if (loading) return <div>Carregando distribuição...</div>

  return (
    <div className="space-y-4">

      <h2 className="text-lg font-bold">Distribuição</h2>

      {/* Modo */}
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        className="bg-[#1f2c33] p-2 rounded"
      >
        <option value="ROUND_ROBIN">Round Robin</option>
        <option value="ORDERED_QUEUE">Fila Ordenada</option>
        <option value="MANUAL_ONLY">Manual</option>
      </select>

      {/* Timeout */}
      <input
        type="number"
        value={timeout}
        onChange={(e) => setTimeoutValue(Number(e.target.value))}
        className="bg-[#1f2c33] p-2 rounded w-full"
        placeholder="Tempo de resposta (segundos)"
      />

      {/* Redistribuição */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={reassign}
          onChange={(e) => setReassign(e.target.checked)}
        />
        Redistribuir automaticamente
      </label>

      {/* Membros */}
      <div>
        <h3 className="font-semibold">Corretores</h3>

        <div className="space-y-2 mt-2">
          {members.map((m: any, i: number) => (
            <div key={i} className="flex justify-between bg-[#202c33] p-2 rounded">
              <span>{m.name}</span>
              <button onClick={() => removeMember(m.userId || m.id)}>remover</button>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <select
            onChange={(e) => {
              const user = users.find(u => u.id === e.target.value)
              if (user) addMember(user)
            }}
            className="bg-[#1f2c33] p-2 rounded w-full"
          >
            <option>Adicionar agente</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="bg-green-600 px-4 py-2 rounded"
      >
        Salvar
      </button>

    </div>
  )
}