'use client'

import { useEffect, useState } from 'react'
import { getUsers } from '@/lib/api'

type User = {
  id: string
  name: string
  role: string
}

export default function CampaignDistributionForm({
  campaignId
}: {
  campaignId: string
}) {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [strategy, setStrategy] = useState<'round_robin' | 'priority'>('round_robin')

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const data = await getUsers()
      setUsers(data.filter((u: User) => u.role === 'agent'))
    } catch (err) {
      console.error('Erro ao carregar usuários', err)
    }
  }

  function toggleUser(userId: string) {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  async function handleSave() {
    console.log('Salvar distribuição:', {
      campaignId,
      strategy,
      selectedUsers
    })

    alert('Configuração salva (mock por enquanto)')
  }

  return (
    <div className="space-y-6 text-white">
      <h2 className="text-xl font-semibold">Configuração de Distribuição</h2>

      {/* Estratégia */}
      <div>
        <label className="block text-sm mb-2 text-neutral-400">
          Estratégia de distribuição
        </label>

        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as any)}
          className="w-full bg-[#1f2c33] p-3 rounded-lg"
        >
          <option value="round_robin">Rodízio (Round Robin)</option>
          <option value="priority">Prioridade</option>
        </select>
      </div>

      {/* Usuários */}
      <div>
        <label className="block text-sm mb-2 text-neutral-400">
          Atendentes participantes
        </label>

        <div className="space-y-2">
          {users.map((user) => (
            <label
              key={user.id}
              className="flex items-center gap-2 bg-[#111b21] p-2 rounded-lg cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedUsers.includes(user.id)}
                onChange={() => toggleUser(user.id)}
              />
              {user.name}
            </label>
          ))}
        </div>
      </div>

      {/* Botão salvar */}
      <button
        onClick={handleSave}
        className="bg-green-600 px-4 py-2 rounded-lg hover:bg-green-700"
      >
        Salvar configuração
      </button>
    </div>
  )
}