const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

function tryFixBrazilPhone(phone: string) {
  if (phone.startsWith('55') && phone.length === 12) {
    return phone.slice(0, 4) + '9' + phone.slice(4)
  }

  return null
}

function getWhatsAppAuthHeaders(contentType?: 'json') {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    ...(contentType === 'json' ? { 'Content-Type': 'application/json' } : {})
  }
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
      headers: getWhatsAppAuthHeaders('json'),
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

  const firstAttempt = await send(to)

  if (firstAttempt.response.ok) {
    return {
      ...firstAttempt.data,
      usedPhone: to,
      fixed: false
    }
  }

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

  throw new Error(
    `WhatsApp send error: ${JSON.stringify(firstAttempt.data)}`
  )
}

export async function markWhatsAppMessageAsRead(params: {
  phoneNumberId: string
  messageId: string
}) {
  const url = `${WHATSAPP_API_URL}/${params.phoneNumberId}/messages`

  await fetch(url, {
    method: 'POST',
    headers: getWhatsAppAuthHeaders('json'),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: params.messageId
    })
  })
}

export async function getWhatsAppMediaMetadata(mediaId: string) {
  const response = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
    method: 'GET',
    headers: getWhatsAppAuthHeaders()
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      `WhatsApp media metadata error: ${JSON.stringify(data)}`
    )
  }

  return data as {
    id: string
    url: string
    mime_type?: string
    sha256?: string
    file_size?: number
  }
}

export async function downloadWhatsAppMediaFile(mediaUrl: string) {
  const response = await fetch(mediaUrl, {
    method: 'GET',
    headers: getWhatsAppAuthHeaders()
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`WhatsApp media download error: ${text}`)
  }

  const arrayBuffer = await response.arrayBuffer()

  return Buffer.from(arrayBuffer)
}