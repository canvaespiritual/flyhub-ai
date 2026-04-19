'use client'

import { useEffect, useRef } from 'react'
import type { Conversation, ConversationMode, Lead, Message, UserRole } from '@flyhub/shared'
import { ChatComposer } from './ChatComposer'
import { MessageBubble } from './MessageBubble'
import type { PresenceStatus, PresenceUser, User } from '@/lib/api'

type SendTextMessagePayload = {
  senderUserId?: string
  type: 'text'
  content: string
}

type Props = {
  selectedConversation: Conversation
  messages: Message[]
  lead: Lead | null
  currentUserId: string
  currentUserRole: UserRole
  users: User[]
  myPresence: PresenceUser | null
  updatingPresence?: boolean
  onUpdatePresence: (status: PresenceStatus) => Promise<void>
  onBack?: () => void
  onSendMessage: (payload: SendTextMessagePayload) => Promise<void>
  onSendMediaMessage?: (payload: {
  type: 'audio' | 'image' | 'document' | 'video'
  file: File
  content?: string
}) => Promise<void>
  onChangeMode: (mode: ConversationMode) => Promise<void>
  onAssignConversation: (
    conversationId: string,
    targetUserId?: string | null
  ) => Promise<void>
  assigningConversation?: boolean
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

function canOperateConversation(
  conversation: Conversation,
  currentUserRole: UserRole,
  currentUserId: string
) {
  if (currentUserRole === 'master') return true
  if (currentUserRole === 'admin') return true
  if (currentUserRole === 'manager') return true

  if (currentUserRole === 'agent') {
    return !conversation.assignedUser || conversation.assignedUser.id === currentUserId
  }

  return false
}

function canAssumeConversation(
  conversation: Conversation,
  currentUserRole: UserRole,
  currentUserId: string
) {
  if (currentUserRole !== 'agent') return false
  if (conversation.assignedUser?.id === currentUserId) return false
  return !conversation.assignedUser
}

function getSlaInfo(conversation: Conversation) {
  if (!conversation.assignedAt) return null
  if (conversation.firstResponseAt) return null
  if (!conversation.assignedUser) return null

  const assignedAt = new Date(conversation.assignedAt).getTime()
  const now = Date.now()
  const elapsedMs = now - assignedAt

  const minutes = Math.floor(elapsedMs / 60000)
  const seconds = Math.floor((elapsedMs % 60000) / 1000)
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`

  if (elapsedMs >= 5 * 60 * 1000) {
    return { level: 'expired' as const, label: `SLA ${formatted}` }
  }

  if (elapsedMs >= 3 * 60 * 1000) {
    return { level: 'warning' as const, label: `SLA ${formatted}` }
  }

  return { level: 'ok' as const, label: `SLA ${formatted}` }
}

export function ChatWindow({
  selectedConversation,
  messages,
  lead,
  currentUserId,
  currentUserRole,
  users,
  myPresence,
  updatingPresence = false,
  onUpdatePresence,
  onBack,
  onSendMessage,
  onSendMediaMessage,
  onChangeMode,
  onAssignConversation,
  assigningConversation = false,
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

    const didAppendNewMessage =
      messages.length > previousMessagesLengthRef.current && !loadingOlderRef.current

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
  const isOwnedByCurrentUser = selectedConversation.assignedUser?.id === currentUserId
  const isUnassigned = !selectedConversation.assignedUser
  const sla = getSlaInfo(selectedConversation)

  const canOperate = canOperateConversation(
    selectedConversation,
    currentUserRole,
    currentUserId
  )

  const canAssume = canAssumeConversation(
    selectedConversation,
    currentUserRole,
    currentUserId
  )

  const isPrivilegedRole =
    currentUserRole === 'master' ||
    currentUserRole === 'admin' ||
    currentUserRole === 'manager'

  const assignableUsers = users.filter((user) => user.eligibleForAssignment)

  const canChangeMode =
    canOperate &&
    !isClosed &&
    (isPrivilegedRole || !isUnassigned || isOwnedByCurrentUser)

  const canSendManualMessage =
    canOperate &&
    isManualMode &&
    !isClosed &&
    (isPrivilegedRole || !isUnassigned || isOwnedByCurrentUser)

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

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-300">
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    isManualMode
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-violet-500/15 text-violet-300'
                  }`}
                >
                  {isManualMode ? 'Manual' : 'IA'}
                </span>

                <span className="rounded-full bg-white/5 px-2 py-0.5">
                  {getConversationStatusLabel(selectedConversation.status)}
                </span>

                {sla && (
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      sla.level === 'expired'
                        ? 'bg-red-500/20 text-red-300'
                        : sla.level === 'warning'
                          ? 'bg-yellow-500/20 text-yellow-300'
                          : 'bg-white/5 text-neutral-300'
                    }`}
                  >
                    {sla.label}
                  </span>
                )}

                {isOwnedByCurrentUser && (
                  <span className="rounded-full bg-[#25d366]/15 px-2 py-0.5 text-[#86efac]">
                    Conversa sua
                  </span>
                )}

                {isUnassigned && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                    Sem responsável
                  </span>
                )}

                {!canOperate && currentUserRole === 'agent' && (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">
                    Somente leitura
                  </span>
                )}

                {selectedConversation.phoneNumber?.label && (
                  <span className="truncate rounded-full bg-white/5 px-2 py-0.5">
                    {selectedConversation.phoneNumber.label}
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-1 text-sm text-neutral-400">
                <p>
                  {isManualMode ? 'Atendimento manual' : 'Modo IA ativo'} •{' '}
                  {getConversationStatusLabel(selectedConversation.status)}
                </p>

                {selectedConversation.assignedUser?.name ? (
                  <p>
                    Responsável:{' '}
                    {isOwnedByCurrentUser
                      ? `${selectedConversation.assignedUser.name} (você)`
                      : selectedConversation.assignedUser.name}
                  </p>
                ) : (
                  <p>Responsável: sem responsável</p>
                )}

                {selectedConversation.phoneNumber?.number && (
                  <p>
                    Linha:{' '}
                    {selectedConversation.phoneNumber.label ??
                      selectedConversation.phoneNumber.number}
                  </p>
                )}

                {!canOperate && currentUserRole === 'agent' && (
                  <p className="text-amber-300">
                    Você está visualizando uma conversa atribuída a outro agente.
                  </p>
                )}

                {isUnassigned && canAssume && !isPrivilegedRole && (
                  <p className="text-amber-300">
                    Assuma a conversa para responder e trocar o modo de atendimento.
                  </p>
                )}

                {sla?.level === 'warning' && (
                  <p className="text-yellow-300">
                    Atenção: esta conversa está se aproximando do limite de primeira resposta.
                  </p>
                )}

                {sla?.level === 'expired' && (
                  <p className="text-red-300">
                    SLA estourado: esta conversa pode voltar para a fila automaticamente.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-[260px] flex-col items-end gap-2">
            {canAssume && (
              <button
                type="button"
                disabled={assigningConversation}
                onClick={() =>
                  onAssignConversation(
                    selectedConversation.id,
                    currentUserRole === 'agent' ? undefined : currentUserId
                  )
                }
                className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assigningConversation
                  ? 'Assumindo...'
                  : selectedConversation.assignedUser
                    ? 'Assumir para mim'
                    : 'Assumir'}
              </button>
            )}

            {currentUserRole === 'agent' && myPresence && (
              <div className="w-full space-y-2">
                <div className="text-right text-xs text-neutral-400">
                  Status:{' '}
                  <span className="font-medium text-white">
                    {myPresence.presenceStatus === 'available' ? 'Disponível' : 'Pausado'}
                  </span>
                </div>

                <div className="flex w-full items-center gap-2">
                  <button
                    type="button"
                    disabled={updatingPresence || myPresence.presenceStatus === 'available'}
                    onClick={() => onUpdatePresence('available')}
                    className="flex-1 rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Disponível
                  </button>

                  <button
                    type="button"
                    disabled={updatingPresence || myPresence.presenceStatus === 'paused'}
                    onClick={() => onUpdatePresence('paused')}
                    className="flex-1 rounded bg-neutral-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Pausar
                  </button>
                </div>
              </div>
            )}

            {isPrivilegedRole && (
              <div className="w-full space-y-2">
                <select
                  className="w-full rounded bg-neutral-800 p-2 text-sm text-white"
                  defaultValue=""
                  onChange={(e) => {
                    const userId = e.target.value
                    if (userId) {
                      onAssignConversation(selectedConversation.id, userId)
                    }
                  }}
                >
                  <option value="">Redistribuir para...</option>

                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="w-full rounded bg-yellow-500 px-3 py-2 text-sm font-semibold text-black"
                  onClick={() => onAssignConversation(selectedConversation.id, null)}
                >
                  Voltar para fila (sem responsável)
                </button>
              </div>
            )}

            <div className="flex shrink-0 items-center gap-2 rounded-full border border-neutral-700 bg-[#0b141a] p-1">
              <button
                type="button"
                disabled={
                  !canChangeMode || changingMode || selectedConversation.mode === 'manual'
                }
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
                disabled={
                  !canChangeMode || changingMode || selectedConversation.mode === 'ai'
                }
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
        <ChatComposer 
  onSend={onSendMessage} 
  onSendMedia={onSendMediaMessage} 
/>
      ) : (
        <div className="border-t border-neutral-800 bg-[#111b21] p-4 text-sm text-neutral-400">
          {selectedConversation.status === 'closed'
            ? 'Esta conversa está encerrada. O envio manual está desativado.'
            : !canOperate
              ? 'Você não pode responder manualmente esta conversa porque ela pertence a outro agente.'
              : isUnassigned && !isPrivilegedRole
                ? 'Assuma a conversa para responder manualmente.'
                : 'Esta conversa está em modo IA. O envio manual está desativado.'}
        </div>
      )}
    </section>
  )
}