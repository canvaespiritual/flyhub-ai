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

export default function MasterAdminsPage() {
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
          title="Admins"
          currentUserName={currentUser.name}
          currentUserRole={currentUser.role}
          onLogout={handleLogout}
        />
      }
    >
      <div className="h-full overflow-y-auto bg-[#0b141a] p-6">
        <div className="rounded-2xl border border-neutral-800 bg-[#111b21] p-6">
          <h2 className="text-xl font-semibold text-white">Admins por operação</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Aqui entraremos depois com gestão de admins responsáveis por cada tenant.
          </p>
        </div>
      </div>
    </AppShell>
  )
}