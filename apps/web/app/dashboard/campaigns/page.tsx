'use client'

import { useEffect, useState } from 'react'
import { getCampaigns, getCampaignOptions, createCampaign } from '@/lib/api'
import CampaignForm from './CampaignForm'

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [options, setOptions] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null)

  async function load() {
    setLoading(true)

    const [c, o] = await Promise.all([
      getCampaigns(),
      getCampaignOptions()
    ])

    setCampaigns(c)
    setOptions(o)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function handleSuccess() {
    setSelectedCampaign(null)
    load()
  }

  if (loading) {
    return <div className="p-6 text-white">Carregando campanhas...</div>
  }

  return (
    <div className="p-6 text-white grid grid-cols-2 gap-6">
      {/* 🔹 LISTA */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Campanhas</h1>

          <button
            onClick={() => setSelectedCampaign({})}
            className="bg-blue-600 px-4 py-2 rounded font-semibold"
          >
            Nova campanha
          </button>
        </div>

        <div className="space-y-2">
          {campaigns.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelectedCampaign(c)}
              className="bg-[#202c33] p-3 rounded-xl cursor-pointer hover:bg-[#2a3942]"
            >
              <div className="font-semibold">{c.name}</div>

              <div className="text-sm text-neutral-400">
                Gatilho: {c.fallbackText || '—'}
              </div>

              <div className="text-xs text-neutral-500">
                {c.initialSteps?.length || 0} steps
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 🔥 FORM / EDIÇÃO */}
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
            Selecione uma campanha ou crie uma nova
          </div>
        )}
      </div>
    </div>
  )
}