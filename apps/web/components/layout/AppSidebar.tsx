'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@flyhub/shared'

type SidebarItem = {
  label: string
  href: string
  roles: UserRole[]
}

type Props = {
  currentUserRole: UserRole
  currentUserName?: string
  currentTenantName?: string
}

const dashboardItems: SidebarItem[] = [
  {
    label: 'Atendimentos',
    href: '/dashboard',
    roles: ['agent', 'manager', 'admin']
  },
  {
    label: 'Números',
    href: '/dashboard/phone-numbers',
    roles: ['manager', 'admin']
  },
  {
  label: 'IA',
  href: '/dashboard/ai',
  roles: ['admin']
},
  {
    label: 'Configurações',
    href: '/dashboard/settings',
    roles: ['manager', 'admin']
  }
]

const masterItems: SidebarItem[] = [
  {
    label: 'Painel master',
    href: '/master',
    roles: ['master']
  },
  {
    label: 'Operações',
    href: '/master/operations',
    roles: ['master']
  },
  {
    label: 'Admins',
    href: '/master/admins',
    roles: ['master']
  }
]

function isItemVisible(item: SidebarItem, role: UserRole) {
  return item.roles.includes(role)
}

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard'
  }

  if (href === '/master') {
    return pathname === '/master'
  }

  return pathname.startsWith(href)
}

export function AppSidebar({
  currentUserRole,
  currentUserName,
  currentTenantName
}: Props) {
  const pathname = usePathname()

  const items =
    currentUserRole === 'master'
      ? masterItems.filter((item) => isItemVisible(item, currentUserRole))
      : dashboardItems.filter((item) => isItemVisible(item, currentUserRole))

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 px-5 py-4">
        <div className="text-lg font-semibold text-white">FlyHub AI</div>

        <div className="mt-3 space-y-1 text-xs text-neutral-400">
          <div>{currentUserName || 'Usuário'}</div>
          <div className="uppercase tracking-wide">{currentUserRole}</div>
          {currentTenantName ? <div>{currentTenantName}</div> : null}
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active = isActive(pathname, item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-xl px-3 py-2 text-sm transition ${
                active
                  ? 'bg-[#202c33] text-white'
                  : 'text-neutral-300 hover:bg-[#1a252c]'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}