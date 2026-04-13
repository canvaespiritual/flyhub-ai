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
    message.type === 'document'
  )
}