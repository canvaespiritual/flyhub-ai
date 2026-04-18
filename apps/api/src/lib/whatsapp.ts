const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

function tryFixBrazilPhone(phone: string) {
  // só tenta corrigir Brasil com 12 dígitos
  if (phone.startsWith('55') && phone.length === 12) {
    return phone.slice(0, 4) + '9' + phone.slice(4)
  }

  return null
}

export async function sendWhatsAppTextMessage(params: {
  phoneNumberId: string
  to: string
  text: string
}) {
  const { phoneNumberId, to, text } = params

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  async function send(toNumber: string) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'text',
        text: {
          body: text
        }
      })
    })

    const data = await response.json()

    return { response, data }
  }

  // 🔥 tentativa 1 (normal)
  const firstAttempt = await send(to)

  if (firstAttempt.response.ok) {
    return {
      ...firstAttempt.data,
      usedPhone: to,
      fixed: false
    }
  }

  // 🔥 fallback Brasil (somente caso específico)
  const fixedPhone = tryFixBrazilPhone(to)

  if (fixedPhone && fixedPhone !== to) {
    const secondAttempt = await send(fixedPhone)

    if (secondAttempt.response.ok) {
      return {
        ...secondAttempt.data,
        usedPhone: fixedPhone,
        fixed: true
      }
    }
  }

  // ❌ falhou geral
  throw new Error(
    `WhatsApp send error: ${JSON.stringify(firstAttempt.data)}`
  )
}