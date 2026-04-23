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

const cards = [
  {
    title: 'Operações',
    description: 'Cadastrar e governar tenants/operações do ecossistema.'
  },
  {
    title: 'Admins',
    description: 'Criar e vincular admins responsáveis por cada operação.'
  },
  {
    title: 'Números globais',
    description: 'Preparar o núcleo da operação master e roteamento macro.'
  },
  {
    title: 'Governança SaaS',
    description: 'Área futura para limites, status globais e expansão do produto.'
  }
]

export default function MasterPage() {
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

        if (auth.user.role !== 'master') {
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
          title="Painel master"
          currentUserName={currentUser.name}
          currentUserRole={currentUser.role}
          onLogout={handleLogout}
        />
      }
    >
      <div className="h-full overflow-y-auto bg-[#0b141a] p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white">Governança SaaS</h2>
          <p className="mt-2 text-sm text-neutral-400">
            O master governa operações, não precisa cair no fluxo interno de atendimento.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-neutral-800 bg-[#111b21] p-5"
            >
              <h3 className="text-lg font-semibold text-white">{card.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}