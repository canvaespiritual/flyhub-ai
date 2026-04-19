'use client'

import { useEffect, useState } from 'react'
import { getCampaigns, getCampaignOptions, createCampaign } from '@/lib/api'

type Campaign = {
  id: string
  name: string
  phoneNumberId: string
  managerId?: string
  metaAdId?: string
  ref?: string
  fallbackText?: string
  initialPrompt?: string
  isActive: boolean
}

type Options = {
  phoneNumbers: {
    id: string
    number: string
    label?: string
  }[]
  managers: {
    id: string
    name: string
  }[]
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [options, setOptions] = useState<Options | null>(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '',
    phoneNumberId: '',
    managerId: '',
    metaAdId: '',
    ref: '',
    fallbackText: '',
    initialPrompt: ''
  })

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

  async function handleCreate() {
    await createCampaign({
      ...form,
      managerId: form.managerId || null,
      metaAdId: form.metaAdId || null,
      ref: form.ref || null,
      fallbackText: form.fallbackText || null,
      initialPrompt: form.initialPrompt || null
    })

    setForm({
      name: '',
      phoneNumberId: '',
      managerId: '',
      metaAdId: '',
      ref: '',
      fallbackText: '',
      initialPrompt: ''
    })

    await load()
  }

  if (loading) {
    return <div className="p-6 text-white">Carregando campanhas...</div>
  }

  return (
    <div className="p-6 text-white space-y-6">
      <h1 className="text-2xl font-bold">Campanhas</h1>

      {/* FORM */}
      <div className="bg-[#111b21] p-4 rounded-xl space-y-3">
        <input
          placeholder="Nome"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full p-2 bg-black rounded"
        />

        <select
          value={form.phoneNumberId}
          onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
          className="w-full p-2 bg-black rounded"
        >
          <option value="">Selecionar número</option>
          {options?.phoneNumbers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label || p.number}
            </option>
          ))}
        </select>

        <select
          value={form.managerId}
          onChange={(e) => setForm({ ...form, managerId: e.target.value })}
          className="w-full p-2 bg-black rounded"
        >
          <option value="">Selecionar manager</option>
          {options?.managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Meta Ad ID"
          value={form.metaAdId}
          onChange={(e) => setForm({ ...form, metaAdId: e.target.value })}
          className="w-full p-2 bg-black rounded"
        />

        <input
          placeholder="Ref (opcional)"
          value={form.ref}
          onChange={(e) => setForm({ ...form, ref: e.target.value })}
          className="w-full p-2 bg-black rounded"
        />

        <input
          placeholder="Fallback text"
          value={form.fallbackText}
          onChange={(e) => setForm({ ...form, fallbackText: e.target.value })}
          className="w-full p-2 bg-black rounded"
        />

        <textarea
          placeholder="Prompt inicial"
          value={form.initialPrompt}
          onChange={(e) => setForm({ ...form, initialPrompt: e.target.value })}
          className="w-full p-2 bg-black rounded"
        />

        <button
          onClick={handleCreate}
          className="bg-green-500 px-4 py-2 rounded font-semibold"
        >
          Criar campanha
        </button>
      </div>

      {/* LISTA */}
      <div className="space-y-2">
        {campaigns.map((c) => (
          <div key={c.id} className="bg-[#202c33] p-3 rounded-xl">
            <div className="font-semibold">{c.name}</div>
            <div className="text-sm text-neutral-400">
              AdID: {c.metaAdId || '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}