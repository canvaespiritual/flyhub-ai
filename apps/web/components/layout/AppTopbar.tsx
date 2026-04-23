'use client'

import Link from 'next/link'
import type { UserRole } from '@flyhub/shared'

type Props = {
  title: string
  currentUserName?: string
  currentUserRole: UserRole
  onLogout: () => void
}

function canSeeSettings(role: UserRole) {
  return role === 'manager' || role === 'admin'
}

export function AppTopbar({
  title,
  currentUserName,
  currentUserRole,
  onLogout
}: Props) {
  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-white md:text-base">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {canSeeSettings(currentUserRole) && (
          <Link
            href="/dashboard/settings"
            className="rounded-md bg-[#202c33] px-3 py-2 text-xs text-white transition hover:bg-[#2a3942]"
            title="Abrir configurações"
          >
            Engrenagem
          </Link>
        )}

        <div className="hidden text-xs text-neutral-400 md:block">
          {currentUserName || 'Usuário'} ({currentUserRole})
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-700"
        >
          Sair
        </button>
      </div>
    </header>
  )
}