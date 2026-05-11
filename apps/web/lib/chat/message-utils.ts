import type { Message } from '@flyhub/shared'

function prefixBySender(message: Message) {
  if (message.senderType === 'ai') return 'IA: '
  if (message.senderType === 'agent') return 'Você: '
  return ''
}

export function getMessagePreview(message?: Message): string {
  if (!message) return ''

  const prefix = prefixBySender(message)

  switch (message.type) {
    case 'text': {
      const content = message.content?.trim()

      if (!content) return prefix + 'Mensagem vazia'

      const truncated =
        content.length > 60 ? content.slice(0, 60) + '…' : content

      return prefix + truncated
    }

    case 'audio':
      return prefix + '🎤 Áudio'

    case 'image':
      return prefix + '🖼️ Imagem'

    case 'document':
      return prefix + '📄 Documento'

    case 'video':
      return prefix + '🎬 Vídeo'

    case 'location':
      if (message.locationName?.trim()) {
        return prefix + `📍 ${message.locationName.trim()}`
      }

      if (message.locationAddress?.trim()) {
        return prefix + `📍 ${message.locationAddress.trim()}`
      }

      return prefix + '📍 Localização'

    default:
      return prefix + 'Mensagem'
  }
}

export function getMessageContent(message?: Message): string {
  if (!message) return ''
  return message.content?.trim() ?? ''
}

export function isTextMessage(message: Message): boolean {
  return message.type === 'text'
}

export function isMediaMessage(message: Message): boolean {
  return (
    message.type === 'audio' ||
    message.type === 'image' ||
    message.type === 'document' ||
    message.type === 'video'
  )
}

export function isLocationMessage(message: Message): boolean {
  return message.type === 'location'
}

export function formatConversationListDate(value?: string): string {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays === 0) {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (diffDays === 1) return 'Ontem'

  if (diffDays >= 2 && diffDays <= 6) {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'short'
    })
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  })
}

export function getMessageDateKey(value?: string): string {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

export function formatChatDateSeparator(value?: string): string {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'

  if (diffDays >= 2 && diffDays <= 6) {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    })
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}