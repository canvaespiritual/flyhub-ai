'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

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

type RecorderState = 'idle' | 'recording' | 'preview'

function getSupportedAudioMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return ''
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4'
  ]

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }

  return ''
}

function getExtensionFromMimeType(mimeType: string) {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'm4a'
  return 'webm'
}

export function ChatComposer({ onSend, onSendMedia }: Props) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [recorderState, setRecorderState] = useState<RecorderState>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const [recordedAudioMimeType, setRecordedAudioMimeType] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const canUseRecorder = typeof window !== 'undefined' && typeof navigator !== 'undefined'
  const supportedAudioMimeType = useMemo(() => getSupportedAudioMimeType(), [])

  useEffect(() => {
    return () => {
      cleanupRecorder()
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl)
      }
    }
  }, [recordedAudioUrl])

  function cleanupRecorder() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // noop
      }
    }

    mediaRecorderRef.current = null

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    recordingChunksRef.current = []
  }

  function clearRecordedPreview() {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl)
    }

    setRecordedAudioBlob(null)
    setRecordedAudioUrl(null)
    setRecordedAudioMimeType('')
    setRecordingSeconds(0)
    setRecorderState('idle')
  }

  function formatRecordingTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  async function handleSend() {
    const content = value.trim()
    if (!content || sending || recorderState === 'recording') return

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
    if (!file || sending || !onSendMedia || recorderState === 'recording') return

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
    if (recorderState === 'recording') return
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    void handleFileSelected(file)
    e.target.value = ''
  }

  async function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      await handleSend()
    }
  }

  async function startRecording() {
    if (!onSendMedia) {
      setErrorMessage('Envio de áudio não está habilitado nesta conversa.')
      return
    }

    if (!canUseRecorder || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Seu navegador não suporta gravação de áudio.')
      return
    }

    if (sending) return

    try {
      setErrorMessage(null)

      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl)
      }

      setRecordedAudioBlob(null)
      setRecordedAudioUrl(null)
      setRecordedAudioMimeType('')
      setRecordingSeconds(0)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      })

      mediaStreamRef.current = stream
      recordingChunksRef.current = []

      const mimeType = supportedAudioMimeType || undefined
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = recorder
      setRecordedAudioMimeType(recorder.mimeType || mimeType || 'audio/webm')
      setRecorderState('recording')

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const finalMimeType = recorder.mimeType || recordedAudioMimeType || 'audio/webm'
        const blob = new Blob(recordingChunksRef.current, {
          type: finalMimeType
        })

        const objectUrl = URL.createObjectURL(blob)

        setRecordedAudioBlob(blob)
        setRecordedAudioUrl(objectUrl)
        setRecordedAudioMimeType(finalMimeType)
        setRecorderState('preview')

        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop())
          mediaStreamRef.current = null
        }

        mediaRecorderRef.current = null
        recordingChunksRef.current = []
      }

      recorder.onerror = () => {
        setErrorMessage('Não foi possível gravar o áudio.')
        cleanupRecorder()
        setRecorderState('idle')
      }

      recorder.start()

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error)
      setErrorMessage('Não foi possível acessar o microfone. Verifique a permissão.')
      cleanupRecorder()
      setRecorderState('idle')
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current

    if (!recorder || recorder.state === 'inactive') {
      return
    }

    recorder.stop()
  }

  async function sendRecordedAudio() {
    if (!recordedAudioBlob || !onSendMedia || sending) return

    try {
      setSending(true)
      setErrorMessage(null)

      const mimeType = recordedAudioMimeType || recordedAudioBlob.type || 'audio/webm'
      const extension = getExtensionFromMimeType(mimeType)
      const file = new File(
        [recordedAudioBlob],
        `audio-${Date.now()}.${extension}`,
        { type: mimeType }
      )

      await onSendMedia({
        type: 'audio',
        file,
        content: value.trim() || undefined
      })

      setValue('')
      clearRecordedPreview()
    } catch (error) {
      handleError(error)
    } finally {
      setSending(false)
    }
  }

  async function handleAudioClick() {
    if (recorderState === 'recording') {
      stopRecording()
      return
    }

    if (recorderState === 'preview') {
      await sendRecordedAudio()
      return
    }

    await startRecording()
  }

  function handleDiscardRecording() {
    if (recorderState === 'recording') {
      cleanupRecorder()
      setRecordingSeconds(0)
      setRecorderState('idle')
      return
    }

    clearRecordedPreview()
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

        {recorderState === 'recording' && (
          <div className="flex items-center justify-between rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 animate-pulse" />
              <span>Gravando áudio… {formatRecordingTime(recordingSeconds)}</span>
            </div>

            <button
              type="button"
              onClick={handleDiscardRecording}
              disabled={sending}
              className="rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/15 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        )}

        {recorderState === 'preview' && recordedAudioUrl && (
          <div className="space-y-2 rounded-xl bg-white/5 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-neutral-300">
                Áudio gravado • {formatRecordingTime(recordingSeconds)}
              </span>

              <button
                type="button"
                onClick={handleDiscardRecording}
                disabled={sending}
                className="rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/15 disabled:opacity-60"
              >
                Descartar
              </button>
            </div>

            <audio controls preload="metadata" className="w-full">
              <source src={recordedAudioUrl} type={recordedAudioMimeType || undefined} />
              Seu navegador não suporta reprodução de áudio.
            </audio>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            disabled={sending || recorderState === 'recording'}
          />

          <button
            type="button"
            onClick={handleAttachClick}
            disabled={sending || recorderState === 'recording'}
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

          <div className="flex min-h-[52px] flex-1 items-end rounded-3xl bg-[#202c33] px-3 py-2">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                recorderState === 'recording'
                  ? 'Gravando áudio...'
                  : recorderState === 'preview'
                    ? 'Legenda opcional para o áudio...'
                    : 'Digite uma mensagem...'
              }
              disabled={sending || recorderState === 'recording'}
              rows={1}
              className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-neutral-500 disabled:opacity-60"
            />
          </div>

          {value.trim() ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || recorderState === 'recording'}
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
              disabled={sending || (!canUseRecorder && recorderState === 'idle')}
              title={
                recorderState === 'recording'
                  ? 'Parar gravação'
                  : recorderState === 'preview'
                    ? 'Enviar áudio gravado'
                    : 'Gravar áudio'
              }
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-black transition hover:opacity-90 disabled:opacity-60 ${
                recorderState === 'recording'
                  ? 'bg-red-500'
                  : recorderState === 'preview'
                    ? 'bg-[#53bdeb]'
                    : 'bg-[#25d366]'
              }`}
            >
              {recorderState === 'recording' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : recorderState === 'preview' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22 2L11 13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M22 2L15 22L11 13L2 9L22 2Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
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
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}