'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppTopbar } from '@/components/layout/AppTopbar'
import {
  createMasterTenant,
  getCurrentUser,
  getMasterTenants,
  logout,
  updateMasterTenant,
  type MasterTenant
} from '@/lib/api'
import type { UserRole } from '@flyhub/shared'

type CurrentUser = {
  id: string
  name: string
  email: string
  role: UserRole
  tenantId: string
}

export default function MasterOperationsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [tenants, setTenants] = useState<MasterTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingTenant, setEditingTenant] = useState<MasterTenant | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')

  function handleLogout() {
    logout().finally(() => {
      window.location.replace('/')
    })
  }

  async function loadTenants() {
    const data = await getMasterTenants()
    setTenants(data)
  }

  function resetForm() {
    setEditingTenant(null)
    setName('')
    setSlug('')
    setTimezone('America/Sao_Paulo')
    setError(null)
  }

  function startEditingTenant(tenant: MasterTenant) {
    setEditingTenant(tenant)
    setName(tenant.name || '')
    setSlug(tenant.slug || '')
    setTimezone(tenant.timezone || 'America/Sao_Paulo')
    setError(null)
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const auth = await getCurrentUser()

        if (!auth?.user) {
          window.location.replace('/')
          return
        }

        if (auth.user.role !== 'master') {
          window.location.replace('/dashboard')
          return
        }

        setCurrentUser(auth.user)
        await loadTenants()
      } catch {
        window.location.replace('/')
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  async function handleSubmitTenant(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (editingTenant) {
        await updateMasterTenant(editingTenant.id, {
          name,
          slug: slug.trim() || null,
          timezone: timezone.trim() || 'America/Sao_Paulo'
        })
      } else {
        await createMasterTenant({
          name,
          slug: slug.trim() || null,
          timezone: timezone.trim() || 'America/Sao_Paulo'
        })
      }

      resetForm()
      await loadTenants()
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar operação')
    } finally {
      setSaving(false)
    }
  }

  async function toggleTenantStatus(tenant: MasterTenant) {
    setSaving(true)
    setError(null)

    try {
      await updateMasterTenant(tenant.id, {
        isActive: !tenant.isActive
      })

      await loadTenants()
    } catch (err: any) {
      setError(err?.message || 'Erro ao atualizar operação')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !currentUser) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#0b141a] text-white">
        Carregando...
      </main>
    )
  }

  return (
    <AppShell
      sidebar={
        <AppSidebar
          currentUserRole={currentUser.role}
          currentUserName={currentUser.name}
          currentTenantName="Núcleo master"
        />
      }
      topbar={
        <AppTopbar
          title="Operações"
          currentUserName={currentUser.name}
          currentUserRole={currentUser.role}
          onLogout={handleLogout}
        />
      }
    >
      <div className="h-full overflow-y-auto bg-[#0b141a] p-6 text-white">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <form
            onSubmit={handleSubmitTenant}
            className="rounded-2xl border border-neutral-800 bg-[#111b21] p-6"
          >
            <h2 className="text-xl font-semibold">
              {editingTenant ? 'Editar operação' : 'Nova operação'}
            </h2>

            <p className="mt-2 text-sm text-neutral-400">
              {editingTenant
                ? 'Atualize nome, slug ou timezone da operação selecionada.'
                : 'Crie um tenant isolado para Rio, Goiás, Brasília ou qualquer nova operação.'}
            </p>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  Nome da operação
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-black p-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Operação Rio"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  Slug
                </label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-black p-3 text-sm outline-none focus:border-blue-500"
                  placeholder="operacao-rio"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Se deixar vazio ao criar, o sistema gera pelo nome.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  Timezone
                </label>
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-black p-3 text-sm outline-none focus:border-blue-500"
                  placeholder="America/Sao_Paulo"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? 'Salvando...'
                  : editingTenant
                    ? 'Salvar alterações'
                    : 'Criar operação'}
              </button>

              {editingTenant ? (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </form>

          <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Operações cadastradas</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Cada operação isola usuários, números, campanhas, IA e conversas.
                </p>
              </div>

              <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300">
                {tenants.length} operações
              </span>
            </div>

            <div className="space-y-3">
              {tenants.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-400">
                  Nenhuma operação cadastrada ainda.
                </div>
              ) : (
                tenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    className={
                      editingTenant?.id === tenant.id
                        ? 'rounded-xl border border-blue-900 bg-blue-950/20 p-4'
                        : 'rounded-xl border border-neutral-800 bg-[#0b141a] p-4'
                    }
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white">
                            {tenant.name}
                          </h3>

                          <span
                            className={
                              tenant.isActive
                                ? 'rounded-full bg-green-950 px-2 py-1 text-xs text-green-300'
                                : 'rounded-full bg-neutral-800 px-2 py-1 text-xs text-neutral-400'
                            }
                          >
                            {tenant.isActive ? 'Ativa' : 'Inativa'}
                          </span>

                          {editingTenant?.id === tenant.id ? (
                            <span className="rounded-full bg-blue-950 px-2 py-1 text-xs text-blue-300">
                              Editando
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 text-xs text-neutral-500">
                          Slug: {tenant.slug || '—'} • Timezone:{' '}
                          {tenant.timezone || '—'}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400 md:grid-cols-4">
                          <div>Usuários: {tenant.usersCount}</div>
                          <div>Números: {tenant.phoneNumbersCount}</div>
                          <div>Campanhas: {tenant.campaignsCount}</div>
                          <div>Conversas: {tenant.conversationsCount}</div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => startEditingTenant(tenant)}
                          className="rounded-xl border border-blue-900 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-950/40 disabled:opacity-60"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => toggleTenantStatus(tenant)}
                          className={
                            tenant.isActive
                              ? 'rounded-xl border border-red-900 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/40 disabled:opacity-60'
                              : 'rounded-xl border border-green-900 px-3 py-2 text-xs font-semibold text-green-300 hover:bg-green-950/40 disabled:opacity-60'
                          }
                        >
                          {tenant.isActive ? 'Inativar' : 'Ativar'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}