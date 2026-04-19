'use client'

import { useRef, useState } from 'react'

type SendTextMessagePayload = {
  type: 'text'
  content: string
}

type SendMediaMessagePayload = {
  type: 'audio' | 'image' | 'document' | 'video'
  file: File
  content?: string
}

type Props = {
  onSend: (payload: SendTextMessagePayload) => Promise<void>
  onSendMedia?: (payload: SendMediaMessagePayload) => Promise<void>
}

type ApiError = Error & {
  code?: string
  requiresTemplate?: boolean
  status?: number
}

export function ChatComposer({ onSend, onSendMedia }: Props) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleSend() {
    const content = value.trim()
    if (!content || sending) return

    try {
      setSending(true)
      setErrorMessage(null)

      await onSend({
        type: 'text',
        content
      })

      setValue('')
    } catch (error) {
      handleError(error)
    } finally {
      setSending(false)
    }
  }

  async function handleFileSelected(file: File) {
    if (!file || sending || !onSendMedia) return

    const detectedType = detectMessageType(file)

    if (!detectedType) {
      setErrorMessage('Tipo de arquivo não suportado')
      return
    }

    try {
      setSending(true)
      setErrorMessage(null)

      await onSendMedia({
        type: detectedType,
        file,
        content: value.trim() || undefined
      })

      setValue('')
    } catch (error) {
      handleError(error)
    } finally {
      setSending(false)
    }
  }

  function detectMessageType(file: File): SendMediaMessagePayload['type'] | null {
    const mime = file.type

    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('video/')) return 'video'

    return 'document'
  }

  function handleAttachClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    handleFileSelected(file)

    // reset input
    e.target.value = ''
  }

  async function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      await handleSend()
    }
  }

  function handleAudioClick() {
    console.log('Gravação futura (IA ou recorder)')
  }

  function handleError(error: unknown) {
    const err = error as ApiError

    console.error('Erro ao enviar mensagem:', err)

    if (err?.requiresTemplate || err?.code === 'WHATSAPP_WINDOW_CLOSED') {
      setErrorMessage(
        'Essa conversa está fora da janela de 24h. É necessário usar um template do WhatsApp.'
      )
    } else if (err?.message) {
      setErrorMessage(err.message)
    } else {
      setErrorMessage('Não foi possível enviar a mensagem. Tente novamente.')
    }
  }

  return (
    <div className="border-t border-neutral-800 bg-[#111b21] p-3 md:p-4">
      <div className="flex flex-col gap-2">
        {errorMessage && (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {errorMessage}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* INPUT OCULTO */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* 📎 ANEXO */}
          <button
            type="button"
            onClick={handleAttachClick}
            disabled={sending}
            title="Anexar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#202c33] text-neutral-300 transition hover:bg-[#26353d] disabled:opacity-60"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M21.44 11.05l-8.49 8.49a5 5 0 01-7.07-7.07l9.19-9.19a3 3 0 114.24 4.24l-9.2 9.2a1 1 0 01-1.41-1.42l8.49-8.48"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* 💬 INPUT */}
          <div className="flex min-h-[52px] flex-1 items-end rounded-3xl bg-[#202c33] px-3 py-2">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              disabled={sending}
              rows={1}
              className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-neutral-500 disabled:opacity-60"
            />
          </div>

          {/* 📤 ENVIAR ou 🎤 */}
          {value.trim() ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              title="Enviar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-black transition hover:opacity-90 disabled:opacity-60"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M22 2L15 22L11 13L2 9L22 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAudioClick}
              disabled={sending}
              title="Gravar áudio"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-black transition hover:opacity-90 disabled:opacity-60"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M19 11a7 7 0 01-14 0"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}