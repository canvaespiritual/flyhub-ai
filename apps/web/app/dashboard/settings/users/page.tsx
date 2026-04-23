'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppTopbar } from '@/components/layout/AppTopbar'
import {
  createUser,
  getCurrentUser,
  getUsers,
  logout,
  updateUser,
  updateUserStatus,
  type User
} from '@/lib/api'
import type { UserRole } from '@flyhub/shared'

type CurrentUser = {
  id: string
  name: string
  email: string
  role: UserRole
  tenantId: string
}

type FormState = {
  name: string
  email: string
  password: string
  role: 'admin' | 'manager' | 'agent'
  managerId: string
}

type StatusTab = 'active' | 'inactive' | 'all'

const initialForm: FormState = {
  name: '',
  email: '',
  password: '',
  role: 'manager',
  managerId: ''
}

function canAccessUsers(role: UserRole) {
  return role === 'admin' || role === 'master'
}

function formatRole(role: 'master' | 'admin' | 'manager' | 'agent') {
  switch (role) {
    case 'master':
      return 'MASTER'
    case 'admin':
      return 'ADMIN'
    case 'manager':
      return 'MANAGER'
    case 'agent':
      return 'AGENT'
  }
}

export default function DashboardSettingsUsersPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusTab, setStatusTab] = useState<StatusTab>('active')
  const [form, setForm] = useState<FormState>(initialForm)

  function handleLogout() {
    logout().finally(() => {
      window.location.replace('/')
    })
  }

  async function loadUsers(status: StatusTab = statusTab) {
    const data = await getUsers({ status })
    setUsers(data)
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const auth = await getCurrentUser()

        if (!auth?.user) {
          window.location.replace('/')
          return
        }

        if (!canAccessUsers(auth.user.role)) {
          window.location.replace('/dashboard/settings')
          return
        }

        setCurrentUser(auth.user)
        await loadUsers('active')
      } catch {
        window.location.replace('/')
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  useEffect(() => {
    if (!currentUser) return
    loadUsers(statusTab)
  }, [statusTab])

  useEffect(() => {
    if (!successMessage && !errorMessage) return

    const timeout = setTimeout(() => {
      setSuccessMessage(null)
      setErrorMessage(null)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [successMessage, errorMessage])

  const managers = useMemo(() => {
    return users.filter((user) => user.role === 'manager' && user.isActive)
  }, [users])

  const allowedRoles =
    currentUser?.role === 'master'
      ? [{ value: 'admin', label: 'Admin' as const }]
      : [
          { value: 'manager', label: 'Manager' as const },
          { value: 'agent', label: 'Agent' as const }
        ]

  function resetForm() {
    setEditingUserId(null)
    setForm(
      currentUser?.role === 'master'
        ? { ...initialForm, role: 'admin' }
        : initialForm
    )
  }

  function startEditing(user: User) {
    if (currentUser?.role !== 'admin') return
    if (user.role === 'master' || user.role === 'admin') return

    setEditingUserId(user.id)
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role === 'agent' ? 'agent' : 'manager',
      managerId: user.managerId || ''
    })
    setSuccessMessage(null)
    setErrorMessage(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSaving(true)
      setErrorMessage(null)
      setSuccessMessage(null)

      if (form.role === 'agent' && !form.managerId) {
        setErrorMessage('Agent precisa estar vinculado a um manager')
        return
      }

      if (editingUserId) {
        await updateUser(editingUserId, {
          name: form.name.trim(),
          email: form.email.trim(),
          ...(form.password.trim() ? { password: form.password } : {}),
          ...(currentUser?.role === 'admin'
            ? {
                role: form.role === 'agent' ? 'agent' : 'manager',
                managerId: form.role === 'agent' ? form.managerId : null
              }
            : {})
        })

        setSuccessMessage('Usuário atualizado com sucesso')
      } else {
        await createUser({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          managerId: form.role === 'agent' ? form.managerId || null : null
        })

        setSuccessMessage('Usuário criado com sucesso')
      }

      resetForm()
      await loadUsers()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao salvar usuário')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleUser(user: User) {
    try {
      setTogglingUserId(user.id)
      setErrorMessage(null)
      setSuccessMessage(null)

      await updateUserStatus(user.id, {
        isActive: !user.isActive
      })

      await loadUsers()
      setSuccessMessage(
        !user.isActive
          ? 'Usuário reativado com sucesso'
          : 'Usuário inativado com sucesso'
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao atualizar status do usuário'
      )
    } finally {
      setTogglingUserId(null)
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
          currentTenantName={currentUser.tenantId}
        />
      }
      topbar={
        <AppTopbar
          title="Usuários"
          currentUserName={currentUser.name}
          currentUserRole={currentUser.role}
          onLogout={handleLogout}
        />
      }
    >
      <div className="h-full overflow-y-auto bg-[#0b141a] p-6">
        {(successMessage || errorMessage) && (
          <div className="mb-4 space-y-2">
            {successMessage && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {errorMessage}
              </div>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusTab('active')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              statusTab === 'active'
                ? 'bg-green-600 text-white'
                : 'bg-[#111b21] text-neutral-300'
            }`}
          >
            Ativos
          </button>

          <button
            type="button"
            onClick={() => setStatusTab('inactive')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              statusTab === 'inactive'
                ? 'bg-green-600 text-white'
                : 'bg-[#111b21] text-neutral-300'
            }`}
          >
            Inativos
          </button>

          <button
            type="button"
            onClick={() => setStatusTab('all')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              statusTab === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-[#111b21] text-neutral-300'
            }`}
          >
            Todos
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {editingUserId ? 'Editar usuário' : 'Novo usuário'}
                </h2>
                <p className="mt-2 text-sm text-neutral-400">
                  {currentUser.role === 'master'
                    ? 'Nesta etapa, o master cadastra admins.'
                    : editingUserId
                      ? 'Edite managers e agents da operação.'
                      : 'Nesta etapa, o admin cadastra managers e agents.'}
                </p>
              </div>

              {editingUserId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg bg-neutral-700 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-600"
                >
                  Cancelar edição
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm text-neutral-300">Nome</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">
                  {editingUserId ? 'Nova senha (opcional)' : 'Senha'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white outline-none"
                  required={!editingUserId}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Role</label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      role: e.target.value as FormState['role'],
                      managerId: ''
                    }))
                  }
                  disabled={currentUser.role === 'master'}
                  className="w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white outline-none disabled:opacity-70"
                >
                  {allowedRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              {currentUser.role === 'admin' && form.role === 'agent' && (
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">
                    Manager responsável
                  </label>
                  <select
                    value={form.managerId}
                    onChange={(e) => setForm((prev) => ({ ...prev, managerId: e.target.value }))}
                    className="w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white outline-none"
                    required
                  >
                    <option value="">Selecione um manager</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
              >
                {saving
                  ? 'Salvando...'
                  : editingUserId
                    ? 'Salvar alterações'
                    : 'Criar usuário'}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white">Usuários da operação</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Gestão de ativos e inativos da hierarquia da operação.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-white">
                <thead className="text-neutral-400">
                  <tr className="border-b border-neutral-800">
                    <th className="px-3 py-3 font-medium">Nome</th>
                    <th className="px-3 py-3 font-medium">E-mail</th>
                    <th className="px-3 py-3 font-medium">Role</th>
                    <th className="px-3 py-3 font-medium">Manager</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Presença</th>
                    {currentUser.role === 'admin' && (
                      <th className="px-3 py-3 font-medium">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const canAdminManage =
                      currentUser.role === 'admin' &&
                      user.role !== 'master' &&
                      user.role !== 'admin'

                    return (
                      <tr key={user.id} className="border-b border-neutral-900">
                        <td className="px-3 py-3">{user.name}</td>
                        <td className="px-3 py-3 text-neutral-300">{user.email}</td>
                        <td className="px-3 py-3 uppercase">{formatRole(user.role)}</td>
                        <td className="px-3 py-3 text-neutral-300">
                          {user.manager?.name || (user.role === 'agent' ? 'Sem manager' : '—')}
                        </td>
                        <td className="px-3 py-3">
                          {user.isActive ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
                              Ativo
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs text-red-300">
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-neutral-300">
                            {user.presenceStatus}
                          </span>
                        </td>

                        {currentUser.role === 'admin' && (
                          <td className="px-3 py-3">
                            {canAdminManage ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditing(user)}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                >
                                  Editar
                                </button>

                                <button
                                  type="button"
                                  disabled={togglingUserId === user.id}
                                  onClick={() => handleToggleUser(user)}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${
                                    user.isActive
                                      ? 'bg-red-600 hover:bg-red-700'
                                      : 'bg-emerald-600 hover:bg-emerald-700'
                                  } disabled:opacity-60`}
                                >
                                  {togglingUserId === user.id
                                    ? 'Salvando...'
                                    : user.isActive
                                      ? 'Inativar'
                                      : 'Reativar'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-neutral-500">Sem ação</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}

                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={currentUser.role === 'admin' ? 7 : 6}
                        className="px-3 py-8 text-center text-neutral-400"
                      >
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}