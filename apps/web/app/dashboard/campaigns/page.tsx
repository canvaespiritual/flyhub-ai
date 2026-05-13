'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getCampaigns, getCampaignOptions } from '@/lib/api'
import CampaignForm from './CampaignForm'

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null)

  async function load() {
    setLoading(true)

    const c = await getCampaigns()

    setCampaigns(c)
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link
            href="/dashboard"
            className="mb-2 inline-flex text-sm text-neutral-400 hover:text-white"
          >
            ← Voltar ao painel
          </Link>

          <h1 className="text-2xl font-bold">Campanhas</h1>
        </div>

        <button
          onClick={() => setSelectedCampaign({})}
          className="rounded bg-blue-600 px-4 py-2 font-semibold"
        >
          Nova campanha
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-6 overflow-hidden">
        <div className="min-h-0 overflow-y-auto pr-2">
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedCampaign(c)}
                className="cursor-pointer rounded-xl bg-[#202c33] p-3 hover:bg-[#2a3942]"
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

        <div className="min-h-0 overflow-y-auto pr-2">
          {selectedCampaign ? (
            <div className="rounded-xl bg-[#111b21] p-4">
              <CampaignForm
                campaign={selectedCampaign}
                onSuccess={handleSuccess}
              />
            </div>
          ) : (
            <div className="mt-10 text-neutral-400">
              Selecione uma campanha ou crie uma nova
            </div>
          )}
        </div>
      </div>
    </div>
  )
}