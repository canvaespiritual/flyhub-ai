const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0'

type WhatsAppMediaMessageType = 'audio' | 'image' | 'document' | 'video'

function tryFixBrazilPhone(phone: string) {
  if (phone.startsWith('55') && phone.length === 12) {
    return phone.slice(0, 4) + '9' + phone.slice(4)
  }

  return null
}

function getWhatsAppAccessToken(accessToken?: string | null) {
  return accessToken || process.env.WHATSAPP_ACCESS_TOKEN
}
function requireWhatsAppAccessToken(accessToken?: string | null) {
  const token = getWhatsAppAccessToken(accessToken)

  if (!token) {
    throw new Error('WhatsApp access token not configured')
  }

  return token
}

async function readWhatsAppJson(response: Response) {
  const text = await response.text()

  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function getWhatsAppAuthHeaders(contentType?: 'json', accessToken?: string | null) {
  const token = requireWhatsAppAccessToken(accessToken)

  return {
    Authorization: `Bearer ${token}`,
    ...(contentType === 'json' ? { 'Content-Type': 'application/json' } : {})
  }
}

function getWhatsAppUploadAuthHeaders(accessToken?: string | null) {
  const token = requireWhatsAppAccessToken(accessToken)

  return {
    Authorization: `Bearer ${token}`
  }
}

export async function sendWhatsAppTextMessage(params: {
  phoneNumberId: string
  to: string
  text: string
  accessToken?: string | null
}) {
  const { phoneNumberId, to, text, accessToken } = params

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`

  async function send(toNumber: string) {
    const response = await fetch(url, {
      method: 'POST',
      headers: getWhatsAppAuthHeaders('json', accessToken),
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
  accessToken?: string | null
}) {
  const { phoneNumberId, fileBuffer, mimeType, fileName, accessToken } = params

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
    headers: getWhatsAppUploadAuthHeaders(accessToken),
    body: formData
  })
    

  const data = await response.json()
console.log('[WHATSAPP_MEDIA_UPLOAD]', {
    phoneNumberId,
    fileName,
    mimeType,
    ok: response.ok,
    status: response.status,
    data
  })
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
  accessToken?: string | null
}) {
  const { phoneNumberId, to, type, mediaId, caption, fileName, accessToken } = params

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
    const payload = buildMediaPayload(toNumber)

    console.log('[WHATSAPP_MEDIA_SEND_REQUEST]', {
      phoneNumberId,
      to: toNumber,
      type,
      mediaId,
      caption,
      fileName,
      payload
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: getWhatsAppAuthHeaders('json', accessToken),
      body: JSON.stringify(payload)
    })

    const data = await response.json()

    console.log('[WHATSAPP_MEDIA_SEND_RESPONSE]', {
      phoneNumberId,
      to: toNumber,
      type,
      ok: response.ok,
      status: response.status,
      data
    })

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
export async function registerWhatsAppPhoneNumber(params: {
  phoneNumberId: string
  pin: string
  accessToken?: string | null
}) {
  const token = requireWhatsAppAccessToken(params.accessToken)

  const response = await fetch(
    `${WHATSAPP_API_URL}/${params.phoneNumberId}/register`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin: params.pin
      })
    }
  )

  const data = await readWhatsAppJson(response)

  if (!response.ok) {
    throw new Error(`WhatsApp register error: ${JSON.stringify(data)}`)
  }

  return data as { success?: boolean }
}

export async function subscribeWhatsAppBusinessAccount(params: {
  wabaId: string
  accessToken?: string | null
}) {
  const token = requireWhatsAppAccessToken(params.accessToken)

  const response = await fetch(
    `${WHATSAPP_API_URL}/${params.wabaId}/subscribed_apps`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    }
  )

  const data = await readWhatsAppJson(response)

  if (!response.ok) {
    throw new Error(`WhatsApp subscribed_apps error: ${JSON.stringify(data)}`)
  }

  return data as { success?: boolean }
}