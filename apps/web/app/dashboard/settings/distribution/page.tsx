'use client'

import { useEffect, useMemo, useState } from 'react'
import { getCampaigns } from '@/lib/api'
import CampaignDistributionForm from '@/components/dashboard/CampaignDistributionForm'

type Campaign = {
  id: string
  name: string
  managerId?: string
  isActive?: boolean
}

export default function DistributionPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await getCampaigns()
        setCampaigns(data || [])

        if (data?.length) {
          setSelectedCampaignId(data[0].id)
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  )

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b141a] p-6 text-white">
        Carregando distribuição...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0b141a] p-6 text-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Distribuição</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Selecione uma campanha para configurar a rotação e a lógica operacional.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
        <label className="mb-2 block text-sm font-medium text-neutral-300">
          Campanha
        </label>

        <select
          value={selectedCampaignId}
          onChange={(e) => setSelectedCampaignId(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-black p-3 text-white"
        >
          {campaigns.length === 0 && (
            <option value="">Nenhuma campanha encontrada</option>
          )}

          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>

        {selectedCampaign && (
          <div className="mt-3 text-sm text-neutral-400">
            Campanha selecionada:{' '}
            <span className="text-white">{selectedCampaign.name}</span>
          </div>
        )}
      </div>

      {selectedCampaign ? (
        <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
          <CampaignDistributionForm campaignId={selectedCampaign.id} />
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5 text-neutral-400">
          Nenhuma campanha disponível para configurar distribuição.
        </div>
      )}
    </main>
  )
}