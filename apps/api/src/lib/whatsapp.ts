const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

type WhatsAppMediaMessageType = 'audio' | 'image' | 'document' | 'video'

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

function getWhatsAppUploadAuthHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
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

export async function uploadWhatsAppMedia(params: {
  phoneNumberId: string
  fileBuffer: Buffer
  mimeType: string
  fileName: string
}) {
  const { phoneNumberId, fileBuffer, mimeType, fileName } = params

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/media`
  const formData = new FormData()

  const blob = new Blob([new Uint8Array(fileBuffer)], {
    type: mimeType
  })

  formData.append('messaging_product', 'whatsapp')
  formData.append('file', blob, fileName)
  formData.append('type', mimeType)

  const response = await fetch(url, {
    method: 'POST',
    headers: getWhatsAppUploadAuthHeaders(),
    body: formData
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      `WhatsApp media upload error: ${JSON.stringify(data)}`
    )
  }

  return data as {
    id: string
  }
}

export async function sendWhatsAppMediaMessage(params: {
  phoneNumberId: string
  to: string
  type: WhatsAppMediaMessageType
  mediaId: string
  caption?: string
  fileName?: string
}) {
  const { phoneNumberId, to, type, mediaId, caption, fileName } = params

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  function buildMediaPayload(toNumber: string) {
    const basePayload = {
      messaging_product: 'whatsapp',
      to: toNumber,
      type
    } as Record<string, unknown>

    if (type === 'image') {
      basePayload.image = {
        id: mediaId,
        ...(caption?.trim() ? { caption: caption.trim() } : {})
      }
      return basePayload
    }

    if (type === 'video') {
      basePayload.video = {
        id: mediaId,
        ...(caption?.trim() ? { caption: caption.trim() } : {})
      }
      return basePayload
    }

    if (type === 'audio') {
      basePayload.audio = {
        id: mediaId
      }
      return basePayload
    }

    basePayload.document = {
      id: mediaId,
      ...(caption?.trim() ? { caption: caption.trim() } : {}),
      ...(fileName?.trim() ? { filename: fileName.trim() } : {})
    }

    return basePayload
  }

  async function send(toNumber: string) {
    const response = await fetch(url, {
      method: 'POST',
      headers: getWhatsAppAuthHeaders('json'),
      body: JSON.stringify(buildMediaPayload(toNumber))
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
    `WhatsApp media send error: ${JSON.stringify(firstAttempt.data)}`
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