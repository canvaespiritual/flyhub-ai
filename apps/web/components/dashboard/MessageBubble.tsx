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

function buildGoogleMapsUrl(message: Message) {
  const hasCoordinates =
    typeof message.latitude === 'number' &&
    typeof message.longitude === 'number'

  if (hasCoordinates) {
    return `https://www.google.com/maps?q=${message.latitude},${message.longitude}`
  }

  const query = [message.locationName, message.locationAddress]
    .filter(Boolean)
    .join(' ')
    .trim()

  if (!query) return null

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function getDocumentLabel(message: Message) {
  if (message.fileName?.trim()) return message.fileName.trim()
  if (message.mimeType?.trim()) return message.mimeType.trim()
  return 'Documento'
}

export function MessageBubble({ message }: Props) {
  const isOutgoing = isOutgoingMessage(message)
  const metaLabel = getMetaLabel(message)
  const statusChecks = isOutgoing ? getStatusChecks(message.status) : null
  const mapsUrl = message.type === 'location' ? buildGoogleMapsUrl(message) : null

  function renderContent() {
    switch (message.type) {
      case 'text':
        return (
          <p className="whitespace-pre-wrap break-words">
            {message.content ?? ''}
          </p>
        )

      case 'image':
        return (
          <div className="space-y-2">
            {message.mediaUrl ? (
              <a
                href={message.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <img
                  src={message.mediaUrl}
                  alt={message.content || 'Imagem enviada'}
                  loading="lazy"
                  className="max-h-[320px] w-auto max-w-full rounded-lg object-contain"
                />
              </a>
            ) : (
              <p className="italic text-white/80">🖼️ Imagem indisponível</p>
            )}

            {message.content && message.content !== '[image]' && (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}
          </div>
        )

      case 'audio':
        return (
          <div className="space-y-2">
            {message.mediaUrl ? (
              <audio
                controls
                preload="metadata"
                className="max-w-full"
              >
                <source src={message.mediaUrl} type={message.mimeType || undefined} />
                Seu navegador não suporta reprodução de áudio.
              </audio>
            ) : (
              <p className="italic text-white/80">🎤 Áudio indisponível</p>
            )}

            {message.content &&
              message.content !== '[audio]' &&
              message.content !== '[audio too large]' && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
          </div>
        )

      case 'video':
        return (
          <div className="space-y-2">
            {message.mediaUrl ? (
              <video
                controls
                preload="metadata"
                playsInline
                className="max-h-[360px] w-full rounded-lg bg-black"
              >
                <source src={message.mediaUrl} type={message.mimeType || undefined} />
                Seu navegador não suporta reprodução de vídeo.
              </video>
            ) : (
              <p className="italic text-white/80">🎬 Vídeo indisponível</p>
            )}

            {message.content &&
              message.content !== '[video]' &&
              message.content !== '[video too large]' && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
          </div>
        )

      case 'document':
        return (
          <div className="space-y-2">
            {message.mediaUrl ? (
              <a
                href={message.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg bg-white/10 px-3 py-2 transition hover:bg-white/15"
              >
                <div className="font-medium">📄 {getDocumentLabel(message)}</div>
                <div className="mt-1 text-xs text-white/70">
                  {message.mimeType || 'Arquivo'}
                </div>
                <div className="mt-2 text-xs underline underline-offset-2">
                  Abrir documento
                </div>
              </a>
            ) : (
              <p className="italic text-white/80">📄 Documento indisponível</p>
            )}

            {message.content &&
              message.content !== '[document]' &&
              message.content !== '[document too large]' && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
          </div>
        )

      case 'location':
        return (
          <div className="space-y-2">
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <div className="font-medium">📍 Localização</div>

              {message.locationName && (
                <div className="mt-1 text-sm font-medium">{message.locationName}</div>
              )}

              {message.locationAddress && (
                <div className="mt-1 text-sm text-white/80">
                  {message.locationAddress}
                </div>
              )}

              {typeof message.latitude === 'number' &&
                typeof message.longitude === 'number' && (
                  <div className="mt-2 text-xs text-white/70">
                    {message.latitude}, {message.longitude}
                  </div>
                )}

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm underline underline-offset-2"
                >
                  Abrir no mapa
                </a>
              )}
            </div>

            {message.content &&
              message.content !== '[location]' &&
              message.content !== message.locationName &&
              message.content !== message.locationAddress && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
          </div>
        )

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