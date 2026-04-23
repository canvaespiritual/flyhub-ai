import type { ReactNode } from 'react'

type Props = {
  sidebar: ReactNode
  topbar: ReactNode
  children: ReactNode
}

export function AppShell({ sidebar, topbar, children }: Props) {
  return (
    <main className="flex h-screen bg-[#0b141a] text-white">
      <aside className="hidden w-[260px] shrink-0 border-r border-neutral-800 bg-[#111b21] lg:block">
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