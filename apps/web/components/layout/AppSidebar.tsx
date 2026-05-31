'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@flyhub/shared'

type SidebarItem = {
  label: string
  href: string
  roles: UserRole[]
  icon: string
}

type Props = {
  currentUserRole: UserRole
  currentUserName?: string
  currentTenantName?: string
  collapsed?: boolean
}

const dashboardItems: SidebarItem[] = [
  {
    label: 'Atendimentos',
    href: '/dashboard',
    roles: ['agent', 'manager', 'admin'],
    icon: '💬'
  },
  {
    label: 'Números',
    href: '/dashboard/phone-numbers',
    roles: ['manager', 'admin'],
    icon: '📞'
  },
  {
    label: 'IA',
    href: '/dashboard/ai',
    roles: ['admin'],
    icon: '🤖'
  },
  {
    label: 'Configurações',
    href: '/dashboard/settings',
    roles: ['manager', 'admin'],
    icon: '⚙️'
  },
  {
    label: 'Relatórios',
    href: '/dashboard/reports',
    roles: ['manager', 'admin'],
    icon: '📊'
  }
]

const masterItems: SidebarItem[] = [
  {
    label: 'Painel master',
    href: '/master',
    roles: ['master'],
    icon: '🏠'
  },
  {
    label: 'Operações',
    href: '/master/operations',
    roles: ['master'],
    icon: '🏢'
  },
  {
    label: 'Admins',
    href: '/master/admins',
    roles: ['master'],
    icon: '👤'
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
  currentTenantName,
  collapsed = false
}: Props) {
  const pathname = usePathname()

  const items =
    currentUserRole === 'master'
      ? masterItems.filter((item) => isItemVisible(item, currentUserRole))
      : dashboardItems.filter((item) => isItemVisible(item, currentUserRole))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={`border-b border-neutral-800 transition-all duration-200 ${
          collapsed ? 'px-3 py-4' : 'px-5 py-4'
        }`}
      >
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#202c33] font-bold text-white">
            F
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-white">
                FlyHub AI
              </div>

              <div className="mt-3 space-y-1 text-xs text-neutral-400">
                <div className="truncate">
                  {currentUserName || 'Usuário'}
                </div>

                <div className="uppercase tracking-wide">
                  {currentUserRole}
                </div>

                {currentTenantName ? (
                  <div className="truncate">{currentTenantName}</div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = isActive(pathname, item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-xl px-3 py-2 text-sm transition ${
                active
                  ? 'bg-[#202c33] text-white'
                  : 'text-neutral-300 hover:bg-[#1a252c]'
              } ${
                collapsed
                  ? 'justify-center'
                  : 'gap-3'
              }`}
            >
              <span className="text-lg leading-none">
                {item.icon}
              </span>

              {!collapsed && (
                <span className="truncate">
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}