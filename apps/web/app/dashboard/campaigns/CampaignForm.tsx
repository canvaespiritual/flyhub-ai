'use client'

import { useEffect, useState } from 'react'
import {
  getCampaignOptions,
  createCampaign,
  updateCampaign
} from '@/lib/api'

type CampaignFormProps = {
  campaign?: any
  onSuccess?: () => void
}

export default function CampaignForm({
  campaign,
  onSuccess
}: CampaignFormProps) {
  const [name, setName] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [metaAdId, setMetaAdId] = useState('')
  const [ref, setRef] = useState('')
  const [fallbackText, setFallbackText] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [steps, setSteps] = useState<any[]>([])
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([])
  const [managers, setManagers] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadOptions()
  }, [])

  useEffect(() => {
    if (campaign && campaign.id) {
      setName(campaign.name || '')
      setPhoneNumberId(campaign.phoneNumberId || '')
      setManagerId(campaign.managerId || '')
      setMetaAdId(campaign.metaAdId || '')
      setRef(campaign.ref || '')
      setFallbackText(campaign.fallbackText || '')
      setInitialPrompt(campaign.initialPrompt || '')
      setIsActive(campaign.isActive ?? true)
      setSteps(campaign.initialSteps || [])
      return
    }

    setName('')
    setPhoneNumberId('')
    setManagerId('')
    setMetaAdId('')
    setRef('')
    setFallbackText('')
    setInitialPrompt('')
    setIsActive(true)
    setSteps([])
  }, [campaign])

  async function loadOptions() {
    const res = await getCampaignOptions()
    setPhoneNumbers(res.phoneNumbers || [])
    setManagers(res.managers || [])
  }

  function addStep() {
    setSteps([
      ...steps,
      {
        order: steps.length + 1,
        type: 'text',
        content: '',
        delaySeconds: 0,
        isActive: true
      }
    ])
  }

  function updateStep(index: number, field: string, value: any) {
    const updated = [...steps]
    updated[index] = {
      ...updated[index],
      [field]: value
    }
    setSteps(updated)
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const payload = {
        name,
        phoneNumberId,
        managerId: managerId || null,
        metaAdId: metaAdId || null,
        ref: ref || null,
        fallbackText: fallbackText || null,
        initialPrompt: initialPrompt || null,
        isActive,
        initialSteps: steps
      }

      if (campaign?.id) {
        await updateCampaign(campaign.id, payload)
      } else {
        await createCampaign(payload)
      }

      if (onSuccess) onSuccess()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-white">
      <div>
        <label className="block text-sm font-medium mb-1">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Número</label>
        <select
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
        >
          <option value="">Selecione</option>
          {phoneNumbers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label || p.number}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Manager</label>
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
        >
          <option value="">Selecione</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Meta Ad ID</label>
        <input
          value={metaAdId}
          onChange={(e) => setMetaAdId(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Ref</label>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Fallback text</label>
        <input
          value={fallbackText}
          onChange={(e) => setFallbackText(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Prompt inicial</label>
        <textarea
          value={initialPrompt}
          onChange={(e) => setInitialPrompt(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
        />
      </div>

      <div className="border-t border-neutral-700 pt-4">
        <h3 className="text-lg font-semibold mb-3">Sequência inicial</h3>

        {steps.map((step, index) => (
          <div
            key={index}
            className="border border-neutral-700 p-3 mb-3 rounded space-y-2"
          >
            <div className="flex gap-2">
              <input
                type="number"
                value={step.order}
                onChange={(e) =>
                  updateStep(index, 'order', Number(e.target.value))
                }
                className="w-20 p-2 bg-black rounded border border-neutral-700"
                placeholder="Ordem"
              />

              <select
                value={step.type}
                onChange={(e) => updateStep(index, 'type', e.target.value)}
                className="p-2 bg-black rounded border border-neutral-700"
              >
                <option value="text">Texto</option>
                <option value="audio">Áudio</option>
                <option value="image">Imagem</option>
                <option value="link">Link</option>
              </select>

              <input
                type="number"
                value={step.delaySeconds}
                onChange={(e) =>
                  updateStep(index, 'delaySeconds', Number(e.target.value))
                }
                className="w-32 p-2 bg-black rounded border border-neutral-700"
                placeholder="Delay (s)"
              />
            </div>

            <textarea
              value={step.content}
              onChange={(e) => updateStep(index, 'content', e.target.value)}
              className="w-full p-2 bg-black rounded border border-neutral-700"
              placeholder="Conteúdo"
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={step.isActive ?? true}
                onChange={(e) => updateStep(index, 'isActive', e.target.checked)}
              />
              Step ativo
            </label>

            <button
              type="button"
              onClick={() => removeStep(index)}
              className="text-red-400 text-sm"
            >
              Remover
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addStep}
          className="bg-blue-600 text-white px-3 py-1 rounded"
        >
          + Adicionar step
        </button>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span>Campanha ativa</span>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="bg-green-600 text-white px-4 py-2 rounded font-semibold disabled:opacity-60"
      >
        {saving ? 'Salvando...' : campaign?.id ? 'Salvar alterações' : 'Criar campanha'}
      </button>
    </form>
  )
}