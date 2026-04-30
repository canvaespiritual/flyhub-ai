'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppTopbar } from '@/components/layout/AppTopbar'
import {
  createMasterAdmin,
  getCurrentUser,
  getMasterAdmins,
  getMasterTenants,
  logout,
  type MasterAdmin,
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

export default function MasterAdminsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [admins, setAdmins] = useState<MasterAdmin[]>([])
  const [tenants, setTenants] = useState<MasterTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tenantId, setTenantId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleLogout() {
    logout().finally(() => {
      window.location.replace('/')
    })
  }

  async function loadData() {
    const [adminsData, tenantsData] = await Promise.all([
      getMasterAdmins(),
      getMasterTenants()
    ])

    setAdmins(adminsData)
    setTenants(tenantsData.filter((tenant) => tenant.isActive))
  }

  function resetForm() {
    setTenantId('')
    setName('')
    setEmail('')
    setPassword('')
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
        await loadData()
      } catch {
        window.location.replace('/')
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      await createMasterAdmin({
        tenantId,
        name,
        email,
        password
      })

      resetForm()
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar admin')
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
          title="Admins"
          currentUserName={currentUser.name}
          currentUserRole={currentUser.role}
          onLogout={handleLogout}
        />
      }
    >
      <div className="h-full overflow-y-auto bg-[#0b141a] p-6 text-white">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <form
            onSubmit={handleCreateAdmin}
            className="rounded-2xl border border-neutral-800 bg-[#111b21] p-6"
          >
            <h2 className="text-xl font-semibold">Novo admin</h2>

            <p className="mt-2 text-sm text-neutral-400">
              Crie um administrador responsável por uma operação específica.
            </p>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  Operação
                </label>
                <select
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-black p-3 text-sm outline-none focus:border-blue-500"
                  required
                >
                  <option value="">Selecione uma operação</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} {tenant.slug ? `(${tenant.slug})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  Nome do admin
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-black p-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Admin Rio"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  E-mail
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  className="w-full rounded-xl border border-neutral-700 bg-black p-3 text-sm outline-none focus:border-blue-500"
                  placeholder="admin.rio@email.com"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  Senha provisória
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full rounded-xl border border-neutral-700 bg-black p-3 text-sm outline-none focus:border-blue-500"
                  placeholder="mínimo 6 caracteres"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Criando...' : 'Criar admin'}
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Admins cadastrados</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Cada admin enxerga e configura apenas sua própria operação.
                </p>
              </div>

              <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300">
                {admins.length} admins
              </span>
            </div>

            <div className="space-y-3">
              {admins.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-400">
                  Nenhum admin cadastrado ainda.
                </div>
              ) : (
                admins.map((admin) => (
                  <div
                    key={admin.id}
                    className="rounded-xl border border-neutral-800 bg-[#0b141a] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white">
                            {admin.name}
                          </h3>

                          <span
                            className={
                              admin.isActive
                                ? 'rounded-full bg-green-950 px-2 py-1 text-xs text-green-300'
                                : 'rounded-full bg-neutral-800 px-2 py-1 text-xs text-neutral-400'
                            }
                          >
                            {admin.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-neutral-500">
                          {admin.email}
                        </div>

                        <div className="mt-3 text-xs text-neutral-400">
                          Operação: {admin.tenant.name}{' '}
                          {admin.tenant.slug ? `• ${admin.tenant.slug}` : ''}
                        </div>
                      </div>

                      <div className="text-right text-xs text-neutral-500">
                        Criado em{' '}
                        {new Date(admin.createdAt).toLocaleDateString('pt-BR')}
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