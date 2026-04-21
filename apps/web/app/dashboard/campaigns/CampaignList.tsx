'use client'

import { useEffect, useState } from 'react'
import { getCampaigns } from '@/lib/api'
import CampaignForm from './CampaignForm'

export default function CampaignList() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadCampaigns() {
    setLoading(true)
    const data = await getCampaigns()
    setCampaigns(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadCampaigns()
  }, [])

  function handleSuccess() {
    setSelectedCampaign(null)
    loadCampaigns()
  }

  if (loading) {
    return <div className="text-white">Carregando campanhas...</div>
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Campanhas</h2>

          <button
            type="button"
            onClick={() => setSelectedCampaign({})}
            className="bg-blue-600 text-white px-3 py-1 rounded"
          >
            + Nova
          </button>
        </div>

        <div className="space-y-2">
          {campaigns.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelectedCampaign(c)}
              className="bg-[#202c33] p-3 rounded-xl cursor-pointer hover:bg-[#2a3942] text-white"
            >
              <div className="font-semibold">{c.name}</div>
              <div className="text-sm text-neutral-400">
                {c.fallbackText || 'Sem gatilho'}
              </div>
              <div className="text-xs text-neutral-500">
                {c.initialSteps?.length || 0} steps
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {selectedCampaign ? (
          <div className="bg-[#111b21] p-4 rounded-xl">
            <CampaignForm
              campaign={selectedCampaign}
              onSuccess={handleSuccess}
            />
          </div>
        ) : (
          <div className="text-neutral-400 mt-10">
            Selecione ou crie uma campanha
          </div>
        )}
      </div>
    </div>
  )
}