import type { Message } from '@flyhub/shared'

type Props = {
  message: Message
}

function isOutgoingMessage(message: Message) {
  if (message.direction) {
    return message.direction === 'outbound'
  }

  return (
    message.senderType === 'agent' ||
    message.senderType === 'ai' ||
    message.senderType === 'system'
  )
}

function getMetaLabel(message: Message) {
  if (message.senderType === 'ai') return 'IA'
  if (message.senderType === 'agent') return 'Atendente'
  if (message.senderType === 'system') return 'Sistema'
  return null
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getStatusChecks(status?: Message['status']) {
  switch (status) {
    case 'read':
      return {
        symbol: '✓✓',
        className: 'text-[#53bdeb]'
      }
    case 'delivered':
      return {
        symbol: '✓✓',
        className: 'text-white/70'
      }
    case 'sent':
    case 'queued':
      return {
        symbol: '✓',
        className: 'text-white/70'
      }
    default:
      return null
  }
}

export function MessageBubble({ message }: Props) {
  const isOutgoing = isOutgoingMessage(message)
  const metaLabel = getMetaLabel(message)
  const statusChecks = isOutgoing ? getStatusChecks(message.status) : null

  function renderContent() {
    switch (message.type) {
      case 'text':
        return <p className="whitespace-pre-wrap break-words">{message.content ?? ''}</p>

      case 'audio':
        return <p className="italic text-white/80">🎤 Áudio (renderização futura)</p>

      case 'image':
        return <p className="italic text-white/80">🖼️ Imagem (renderização futura)</p>

      case 'document':
        return <p className="italic text-white/80">📄 Documento (renderização futura)</p>

      default:
        return <p>Mensagem não suportada</p>
    }
  }

  return (
    <div className={`flex w-full ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-[10px] px-3 py-2 text-[14px] shadow-sm md:max-w-[70%] ${
          isOutgoing ? 'bg-[#144d37] text-white' : 'bg-[#202c33] text-white'
        }`}
      >
        {metaLabel && (
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
            {metaLabel}
          </p>
        )}

        {renderContent()}

        <div className="mt-1 flex items-end justify-end gap-1 text-[11px] leading-none opacity-70">
          <span>{formatTime(message.createdAt)}</span>

          {statusChecks && (
            <span className={`min-w-[16px] text-right font-medium ${statusChecks.className}`}>
              {statusChecks.symbol}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}