'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppTopbar } from '@/components/layout/AppTopbar'
import { getCurrentUser, logout } from '@/lib/api'
import type { UserRole } from '@flyhub/shared'

type CurrentUser = {
  id: string
  name: string
  email: string
  role: UserRole
  tenantId: string
}

function managerItems() {
  return [
    {
      title: 'Distribuição',
      description: 'Configurar fila, rotação e regras da equipe.',
      href: '/dashboard/settings/distribution',
      status: 'Abrir distribuição'
    }
  ]
}

function adminItems() {
  return [
    {
      title: 'Usuários',
      description: 'Cadastrar managers e atendentes da operação.',
      href: '/dashboard/settings/users',
      status: 'Abrir gestão'
    },
    {
      title: 'Campanhas',
      description: 'Criar campanhas, gatilhos e sequência inicial.',
      href: '/dashboard/campaigns',
      status: 'Abrir campanhas'
    },
    {
      title: 'Distribuição',
      description: 'Configurar fila, rotação e regras de atendimento.',
      href: '/dashboard/settings/distribution?campaignId=SEED',
      status: 'Abrir distribuição'
    },
    {
      title: 'Campos do Lead',
      description: 'Configurar a ficha dinâmica dos leads da operação.',
      href: '/dashboard/settings/lead-fields',
      status: 'Abrir campos'
    }
  ]
}

export default function DashboardSettingsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  function handleLogout() {
    logout().finally(() => {
      window.location.replace('/')
    })
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const auth = await getCurrentUser()

        if (!auth?.user) {
          window.location.replace('/')
          return
        }

        if (auth.user.role !== 'admin' && auth.user.role !== 'manager') {
          window.location.replace('/dashboard')
          return
        }

        setCurrentUser(auth.user)
      } catch {
        window.location.replace('/')
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  if (loading || !currentUser) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#0b141a] text-white">
        Carregando...
      </main>
    )
  }

  const items =
    currentUser.role === 'admin'
      ? [...managerItems(), ...adminItems()]
      : managerItems()

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
          title="Configurações da operação"
          currentUserName={currentUser.name}
          currentUserRole={currentUser.role}
          onLogout={handleLogout}
        />
      }
    >
      <div className="h-full overflow-y-auto bg-[#0b141a] p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white">Painel de configuração</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Aqui vamos separar gestão operacional e estrutura da operação, sem poluir a área de atendimento.
          </p>
        </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5 transition hover:bg-[#202c33]"
            >
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{item.description}</p>
              <div className="mt-4 text-xs text-emerald-300">
                {item.status}
              </div>
            </a>
          ))}
        </div>

        
      </div>
    </AppShell>
  )
}