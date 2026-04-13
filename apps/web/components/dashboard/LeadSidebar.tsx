import type { Lead } from '@flyhub/shared'

type Props = {
  lead: Lead
}

export function LeadSidebar({ lead }: Props) {
  return (
    <aside className="border-l border-neutral-800 bg-[#111b21] p-4 text-white">
      <h3 className="mb-4 text-lg">Lead</h3>

      <div className="space-y-2 text-sm">
        <p>
          <span className="text-neutral-400">Nome:</span> {lead.name}
        </p>

        <p>
          <span className="text-neutral-400">Telefone:</span> {lead.phone}
        </p>

        <p>
          <span className="text-neutral-400">Email:</span> {lead.email}
        </p>
      </div>
    </aside>
  )
}