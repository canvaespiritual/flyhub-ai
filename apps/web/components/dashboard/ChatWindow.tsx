'use client'

import { useEffect, useRef } from 'react'
import type { Conversation, ConversationMode, Lead, Message } from '@flyhub/shared'
import { ChatComposer } from './ChatComposer'
import { MessageBubble } from './MessageBubble'

type SendTextMessagePayload = {
  senderUserId?: string
  type: 'text'
  content: string
}

type Props = {
  selectedConversation: Conversation
  messages: Message[]
  lead: Lead | null
  onBack?: () => void
  onSendMessage: (payload: SendTextMessagePayload) => Promise<void>
  onChangeMode: (mode: ConversationMode) => Promise<void>
  changingMode?: boolean
  hasMoreMessages?: boolean
  loadingOlderMessages?: boolean
  onLoadOlderMessages?: () => Promise<void> | void
}

function getConversationStatusLabel(status: Conversation['status']) {
  switch (status) {
    case 'open':
      return 'Aberta'
    case 'pending':
      return 'Pendente'
    case 'closed':
      return 'Encerrada'
    default:
      return 'Aberta'
  }
}

export function ChatWindow({
  selectedConversation,
  messages,
  lead,
  onBack,
  onSendMessage,
  onChangeMode,
  changingMode = false,
  hasMoreMessages = false,
  loadingOlderMessages = false,
  onLoadOlderMessages
}: Props) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const previousConversationIdRef = useRef<string | null>(null)
  const previousMessagesLengthRef = useRef(0)
  const loadingOlderRef = useRef(false)
  const previousScrollHeightRef = useRef(0)

  useEffect(() => {
    const isConversationChanged = previousConversationIdRef.current !== selectedConversation.id

    if (isConversationChanged) {
      previousConversationIdRef.current = selectedConversation.id
      previousMessagesLengthRef.current = messages.length

      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' })
      })

      return
    }

    const didAppendNewMessage = messages.length > previousMessagesLengthRef.current && !loadingOlderRef.current

    if (didAppendNewMessage) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }

    previousMessagesLengthRef.current = messages.length
  }, [messages, selectedConversation.id])

  useEffect(() => {
    if (!loadingOlderMessages && loadingOlderRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const newScrollHeight = container.scrollHeight
      const previousScrollHeight = previousScrollHeightRef.current
      const diff = newScrollHeight - previousScrollHeight

      container.scrollTop = diff
      loadingOlderRef.current = false
    }
  }, [loadingOlderMessages, messages])

  async function handleScroll() {
    const container = scrollContainerRef.current

    if (!container) return
    if (!hasMoreMessages) return
    if (loadingOlderMessages) return
    if (!onLoadOlderMessages) return

    if (container.scrollTop <= 80) {
      previousScrollHeightRef.current = container.scrollHeight
      loadingOlderRef.current = true
      await onLoadOlderMessages()
    }
  }

  const isManualMode = selectedConversation.mode === 'manual'
  const isClosed = selectedConversation.status === 'closed'
  const canSendManualMessage = isManualMode && !isClosed

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#0b141a]">
      <div className="border-b border-neutral-800 bg-[#111b21] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start">
            <button
              type="button"
              onClick={onBack}
              className="mr-3 text-white md:hidden"
            >
              ←
            </button>

            <div className="min-w-0">
              <h2 className="truncate font-semibold text-white">
                {lead?.name ?? lead?.phone ?? 'Carregando...'}
              </h2>

              <div className="mt-1 space-y-1 text-sm text-neutral-400">
                <p>
                  {isManualMode ? 'Atendimento manual' : 'Modo IA ativo'} •{' '}
                  {getConversationStatusLabel(selectedConversation.status)}
                </p>

                {selectedConversation.assignedUser?.name && (
                  <p>Responsável: {selectedConversation.assignedUser.name}</p>
                )}

                {selectedConversation.phoneNumber?.number && (
                  <p>
                    Linha:{' '}
                    {selectedConversation.phoneNumber.label ??
                      selectedConversation.phoneNumber.number}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-full border border-neutral-700 bg-[#0b141a] p-1">
            <button
              type="button"
              disabled={changingMode || selectedConversation.mode === 'manual'}
              onClick={() => onChangeMode('manual')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                selectedConversation.mode === 'manual'
                  ? 'bg-[#25d366] text-black'
                  : 'text-neutral-300 hover:bg-[#1b2730]'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Manual
            </button>

            <button
              type="button"
              disabled={changingMode || selectedConversation.mode === 'ai'}
              onClick={() => onChangeMode('ai')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                selectedConversation.mode === 'ai'
                  ? 'bg-[#25d366] text-black'
                  : 'text-neutral-300 hover:bg-[#1b2730]'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              IA
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {hasMoreMessages && (
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-[#111b21] px-3 py-1 text-xs text-neutral-400">
              {loadingOlderMessages
                ? 'Carregando mensagens antigas...'
                : 'Role para cima para carregar mais'}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {canSendManualMessage ? (
        <ChatComposer onSend={onSendMessage} />
      ) : (
        <div className="border-t border-neutral-800 bg-[#111b21] p-4 text-sm text-neutral-400">
          {selectedConversation.status === 'closed'
            ? 'Esta conversa está encerrada. O envio manual está desativado.'
            : 'Esta conversa está em modo IA. O envio manual está desativado.'}
        </div>
      )}
    </section>
  )
}