
const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

export async function sendWhatsAppTextMessage(params: {
  phoneNumberId: string
  to: string
  text: string
}) {
  const { phoneNumberId, to, text } = params

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: text
      }
    })
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`WhatsApp send error: ${JSON.stringify(data)}`)
  }

  return data
}