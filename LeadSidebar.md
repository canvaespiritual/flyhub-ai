import type { Lead } from '@flyhub/shared'

type Props = {
  lead: Lead
}

function normalizePhoneForWhatsApp(phone?: string) {
  if (!phone) return ''

  let digits = phone.replace(/\D/g, '')

  // fallback pragmático para celular BR salvo sem o 9
  if (digits.startsWith('55') && digits.length === 12) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4)
  }

  return digits
}

function formatPhone(phone?: string) {
  if (!phone) return '—'

  const digits = normalizePhoneForWhatsApp(phone)

  // Brasil: 55 + DDD + 9 + número
  if (digits.startsWith('55') && digits.length === 13) {
    const country = digits.slice(0, 2)
    const ddd = digits.slice(2, 4)
    const first = digits.slice(4, 9)
    const second = digits.slice(9)
    return `+${country} (${ddd}) ${first}-${second}`
  }

  if (digits.startsWith('55') && digits.length === 12) {
    const country = digits.slice(0, 2)
    const ddd = digits.slice(2, 4)
    const first = digits.slice(4, 8)
    const second = digits.slice(8)
    return `+${country} (${ddd}) ${first}-${second}`
  }

  return phone
}

export function LeadSidebar({ lead }: Props) {
  const waPhone = normalizePhoneForWhatsApp(lead.phone)
  const waLink = waPhone ? `https://wa.me/${waPhone}` : null
  const formattedPhone = formatPhone(lead.phone)

  return (
    <aside className="h-full overflow-y-auto border-l border-neutral-800 bg-[#111b21] p-4 text-white">
      <h3 className="mb-4 text-lg">Lead</h3>

      <div className="space-y-2 text-sm">
        <p>
          <span className="text-neutral-400">Nome:</span> {lead.name}
        </p>

        <p>
          <span className="text-neutral-400">Telefone:</span>{' '}
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="text-[#53bdeb] underline underline-offset-2 hover:text-[#7fd4f7]"
              title="Abrir conversa no WhatsApp"
            >
              {formattedPhone}
            </a>
          ) : (
            formattedPhone
          )}
        </p>

        <p>
          <span className="text-neutral-400">Email:</span> {lead.email || '—'}
        </p>
      </div>
    </aside>
  )
}