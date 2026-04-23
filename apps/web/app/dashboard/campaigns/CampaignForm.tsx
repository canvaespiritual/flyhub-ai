'use client'

import { useEffect, useState } from 'react'
import {
  getCampaignOptions,
  createCampaign,
  updateCampaign,
  uploadCampaignStepMedia,
  type CampaignInitialStepPayload,
  type CampaignStepType
} from '@/lib/api'
import CampaignDistributionForm from './CampaignDistributionForm'


type CampaignFormProps = {
  campaign?: any
  onSuccess?: () => void
}

type StepFormValue = CampaignInitialStepPayload

const PLACEHOLDERS = [
  { label: 'Saudação', value: '{greeting}' },
  { label: 'Nome seguro', value: '{nameSuffix}' }
]

const MEDIA_STEP_TYPES: CampaignStepType[] = [
  'audio',
  'image',
  'document',
  'video'
]

function isMediaStepType(type: CampaignStepType) {
  return MEDIA_STEP_TYPES.includes(type)
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

  const [steps, setSteps] = useState<StepFormValue[]>([])
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([])
  const [managers, setManagers] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [uploadingStepIndex, setUploadingStepIndex] = useState<number | null>(null)

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
      setSteps(
        (campaign.initialSteps || []).map((step: any) => ({
          order: step.order,
          type: step.type,
          content: step.content ?? '',
          mediaUrl: step.mediaUrl ?? '',
          storageKey: step.storageKey ?? '',
          mimeType: step.mimeType ?? '',
          fileName: step.fileName ?? '',
          delaySeconds: step.delaySeconds ?? 0,
          isActive: step.isActive ?? true
        }))
      )
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
        mediaUrl: '',
        storageKey: '',
        mimeType: '',
        fileName: '',
        delaySeconds: 0,
        isActive: true
      }
    ])
  }

  function updateStep(index: number, field: keyof StepFormValue, value: any) {
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

  function insertPlaceholder(index: number, placeholder: string) {
    const currentContent = steps[index]?.content ?? ''
    updateStep(index, 'content', `${currentContent}${placeholder}`)
  }
async function handleStepMediaSelected(
  index: number,
  file: File
) {
  const step = steps[index]

  if (!step || !isMediaStepType(step.type)) return

  try {
    setUploadingStepIndex(index)

    const uploaded = await uploadCampaignStepMedia(
  file,
  step.type as 'audio' | 'image' | 'document' | 'video'
)

    const updated = [...steps]
    updated[index] = {
      ...updated[index],
      mediaUrl: uploaded.mediaUrl,
      storageKey: uploaded.storageKey,
      mimeType: uploaded.mimeType,
      fileName: uploaded.fileName
    }

    setSteps(updated)
  } finally {
    setUploadingStepIndex(null)
  }
}

  function normalizeStepsForSubmit(): CampaignInitialStepPayload[] {
    return steps.map((step) => {
      const isMedia = isMediaStepType(step.type)

      return {
        order: step.order,
        type: step.type,
        content: isMedia ? null : (step.content?.trim() || null),
        mediaUrl: isMedia ? (step.mediaUrl?.trim() || null) : null,
        storageKey: isMedia ? (step.storageKey?.trim() || null) : null,
        mimeType: isMedia ? (step.mimeType?.trim() || null) : null,
        fileName: isMedia ? (step.fileName?.trim() || null) : null,
        delaySeconds: step.delaySeconds ?? 0,
        isActive: step.isActive ?? true
      }
    })
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
        initialSteps: normalizeStepsForSubmit()
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
  <div className="space-y-6">

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

        {steps.map((step, index) => {
          const isMedia = isMediaStepType(step.type)

          return (
            <div
              key={index}
              className="border border-neutral-700 p-3 mb-3 rounded space-y-3"
            >
              <div className="flex gap-2 flex-wrap">
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
                  onChange={(e) =>
                    updateStep(index, 'type', e.target.value as CampaignStepType)
                  }
                  className="p-2 bg-black rounded border border-neutral-700"
                >
                  <option value="text">Texto</option>
                  <option value="audio">Áudio</option>
                  <option value="image">Imagem</option>
                  <option value="document">Documento</option>
                  <option value="video">Vídeo</option>
                  <option value="link">Link</option>
                </select>

                <input
                  type="number"
                  value={step.delaySeconds ?? 0}
                  onChange={(e) =>
                    updateStep(index, 'delaySeconds', Number(e.target.value))
                  }
                  className="w-32 p-2 bg-black rounded border border-neutral-700"
                  placeholder="Delay (s)"
                />
              </div>

              {!isMedia ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {PLACEHOLDERS.map((placeholder) => (
                      <button
                        key={placeholder.value}
                        type="button"
                        onClick={() => insertPlaceholder(index, placeholder.value)}
                        className="text-xs px-2 py-1 rounded border border-neutral-600 bg-neutral-900 hover:bg-neutral-800"
                      >
                        {placeholder.label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={step.content ?? ''}
                    onChange={(e) =>
                      updateStep(index, 'content', e.target.value)
                    }
                    className="w-full p-2 bg-black rounded border border-neutral-700"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      void handleStepMediaSelected(index, file)
                      e.currentTarget.value = ''
                    }}
                    className="w-full p-2 bg-black rounded border border-neutral-700"
                    disabled={saving || uploadingStepIndex === index}
                  />

                  {uploadingStepIndex === index && (
                    <div className="text-sm text-blue-400">
                      Enviando mídia...
                    </div>
                  )}

                  {!!step.fileName && (
                    <div className="text-sm">{step.fileName}</div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...steps]
                      updated[index] = {
                        ...updated[index],
                        mediaUrl: '',
                        storageKey: '',
                        mimeType: '',
                        fileName: ''
                      }
                      setSteps(updated)
                    }}
                    className="text-sm text-red-400"
                  >
                    Limpar mídia
                  </button>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={step.isActive ?? true}
                  onChange={(e) =>
                    updateStep(index, 'isActive', e.target.checked)
                  }
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
          )
        })}

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

    {campaign?.id && (
      <div className="mt-6 border-t border-neutral-700 pt-6">
        <CampaignDistributionForm campaignId={campaign.id} />
      </div>
    )}

  </div>
)
}