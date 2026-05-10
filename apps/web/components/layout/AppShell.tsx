import type { ReactNode } from 'react'

type Props = {
  sidebar: ReactNode
  topbar: ReactNode
  children: ReactNode
  sidebarCollapsed?: boolean
}

export function AppShell({ sidebar, topbar, children, sidebarCollapsed = false }: Props) {
  return (
    <main className="flex h-screen bg-[#0b141a] text-white overflow-hidden">
      <aside
        className={`hidden shrink-0 border-r border-neutral-800 bg-[#111b21] transition-all duration-200 lg:block ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[260px]'
        }`}
      >
        {sidebar}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-neutral-800 bg-[#111b21]">
          {topbar}
        </div>

        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </main>
  )
}