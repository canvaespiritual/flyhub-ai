'use client'

import { useEffect, useState } from 'react'
import {
  createPhoneNumber,
  getPhoneNumberOptions,
  getPhoneNumbers,
  updatePhoneNumber,
  type PhoneNumberPayload
} from '@/lib/api'

export default function PhoneNumbersPage() {
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([])
  const [managers, setManagers] = useState<any[]>([])
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)

    const [numbers, options] = await Promise.all([
      getPhoneNumbers(),
      getPhoneNumberOptions()
    ])

    setPhoneNumbers(numbers || [])
    setManagers(options?.managers || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function handleSuccess() {
    setSelectedPhoneNumber(null)
    load()
  }

  if (loading) {
    return <div className="p-6 text-white">Carregando números...</div>
  }

  return (
    <div className="p-6 text-white grid grid-cols-2 gap-6">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Números</h1>

          <button
            onClick={() => setSelectedPhoneNumber({})}
            className="bg-blue-600 px-4 py-2 rounded font-semibold"
          >
            Novo número
          </button>
        </div>

        <div className="space-y-2">
          {phoneNumbers.map((phoneNumber) => (
            <div
              key={phoneNumber.id}
              onClick={() => setSelectedPhoneNumber(phoneNumber)}
              className="bg-[#202c33] p-3 rounded-xl cursor-pointer hover:bg-[#2a3942]"
            >
              <div className="font-semibold">
                {phoneNumber.label || phoneNumber.number}
              </div>

              <div className="text-sm text-neutral-400">
                {phoneNumber.number}
              </div>

              <div className="text-xs text-neutral-500">
                Phone ID: {phoneNumber.externalId || '—'}
              </div>

              <div className="text-xs text-neutral-500">
                WABA: {phoneNumber.wabaId || phoneNumber.providerAccountId || '—'}
              </div>

              <div className="text-xs mt-1">
                <span
                  className={
                    phoneNumber.hasAccessToken
                      ? 'text-green-400'
                      : 'text-yellow-400'
                  }
                >
                  Token: {phoneNumber.hasAccessToken ? 'configurado' : 'fallback/global'}
                </span>

                <span className="text-neutral-500">
                  {' '}• Status: {phoneNumber.whatsappConnectionStatus || phoneNumber.connectionStatus || '—'}
                </span>
              </div>

              <div className="text-xs text-neutral-500 mt-1">
                Campanhas: {phoneNumber.campaignsCount || 0} • Conversas:{' '}
                {phoneNumber.conversationsCount || 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {selectedPhoneNumber ? (
          <div className="bg-[#111b21] p-4 rounded-xl">
            <PhoneNumberForm
              phoneNumber={selectedPhoneNumber}
              managers={managers}
              onSuccess={handleSuccess}
            />
          </div>
        ) : (
          <div className="text-neutral-400 mt-10">
            Selecione um número ou cadastre um novo
          </div>
        )}
      </div>
    </div>
  )
}

type PhoneNumberFormProps = {
  phoneNumber?: any
  managers: any[]
  onSuccess?: () => void
}

function PhoneNumberForm({
  phoneNumber,
  managers,
  onSuccess
}: PhoneNumberFormProps) {
  const [number, setNumber] = useState('')
  const [label, setLabel] = useState('')
  const [managerId, setManagerId] = useState('')
  const [providerAccountId, setProviderAccountId] = useState('')
  const [externalId, setExternalId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (phoneNumber?.id) {
      setNumber(phoneNumber.number || '')
      setLabel(phoneNumber.label || '')
      setManagerId(phoneNumber.managerId || '')
      setProviderAccountId(phoneNumber.providerAccountId || phoneNumber.wabaId || '')
      setExternalId(phoneNumber.externalId || '')
      setAccessToken('')
      setIsActive(phoneNumber.isActive ?? true)
      setIsDefault(phoneNumber.isDefault ?? false)
      return
    }

    setNumber('')
    setLabel('')
    setManagerId('')
    setProviderAccountId('')
    setExternalId('')
    setAccessToken('')
    setIsActive(true)
    setIsDefault(false)
  }, [phoneNumber])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const payload: PhoneNumberPayload = {
        number,
        label: label || null,
        managerId: managerId || null,
        providerAccountId,
        externalId,
        accessToken: accessToken.trim() ? accessToken.trim() : undefined,
        isActive,
        isDefault
      }

      if (phoneNumber?.id) {
        await updatePhoneNumber(phoneNumber.id, payload)
      } else {
        await createPhoneNumber(payload)
      }

      onSuccess?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-white">
      <div>
        <h2 className="text-xl font-bold">
          {phoneNumber?.id ? 'Editar número' : 'Novo número'}
        </h2>

        <p className="text-sm text-neutral-400 mt-1">
          Cadastre o número real da WABA com Phone Number ID, WABA ID e token.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
          placeholder="Operação Rio"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Telefone</label>
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
          placeholder="5521973223996"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Phone Number ID / externalId
        </label>
        <input
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
          placeholder="1054946001043978"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          WABA ID / providerAccountId
        </label>
        <input
          value={providerAccountId}
          onChange={(e) => setProviderAccountId(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
          placeholder="ID da conta WhatsApp Business"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Access Token
        </label>
        <textarea
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700 min-h-24"
          placeholder={
            phoneNumber?.id
              ? 'Deixe vazio para manter o token atual/fallback'
              : 'Cole o token definitivo aqui'
          }
        />

        {phoneNumber?.hasAccessToken && (
          <div className="text-xs text-green-400 mt-1">
            Este número já possui token configurado.
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Manager</label>
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="w-full p-2 bg-black rounded border border-neutral-700"
        >
          <option value="">Sem manager específico</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span>Número ativo</span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        <span>Número padrão do tenant</span>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="bg-green-600 text-white px-4 py-2 rounded font-semibold disabled:opacity-60"
      >
        {saving ? 'Salvando...' : phoneNumber?.id ? 'Salvar alterações' : 'Cadastrar número'}
      </button>
    </form>
  )
}