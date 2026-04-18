'use client'

import { useEffect, useState } from 'react'
import type { Conversation, ConversationMode, Lead, Message, UserRole } from '@flyhub/shared'
import { ChatWindow } from '@/components/dashboard/ChatWindow'
import { ConversationList } from '@/components/dashboard/ConversationList'
import { LeadSidebar } from '@/components/dashboard/LeadSidebar'
import {
  assignConversation,
  logout,
  getConversations,
  getCurrentUser,
  getMessages,
  getLead,
  sendMessage,
  getUsers,
  getMyPresence,
  updateMyPresence,
  updateConversationMode
} from '@/lib/api'
import type { PresenceStatus, PresenceUser, User } from '@/lib/api'

type SendTextMessagePayload = {
  senderUserId?: string
  type: 'text'
  content: string
}

type CurrentUser = {
  id: string
  name: string
  email: string
  role: UserRole
  tenantId: string
}

type ConversationRealtimePayload = {
  id: string
  mode: ConversationMode
  status: 'open' | 'pending' | 'closed'
  updatedAt: string
  assignedAt?: string
  waitingSince?: string
  firstResponseAt?: string
  closedAt?: string
  priority?: 'low' | 'normal' | 'high'
  subject?: string
  metaThreadId?: string
  assignedUser?: {
    id: string
    name: string
    email: string
    role?: UserRole
  } | null
  phoneNumber: {
    id: string
    number: string
    label?: string
  }
}

type RealtimeEvent =
  | {
      type: 'message:new'
      payload: Message
    }
  | {
      type: 'conversation:mode_changed' | 'conversation:assigned'
      payload: ConversationRealtimePayload
    }
  | {
      type: 'connected'
      payload?: unknown
    }
  | {
      type: 'heartbeat'
      payload?: unknown
    }

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api'
const INITIAL_MESSAGES_LIMIT = 20

function getWebSocketUrl() {
  const apiUrl = new URL(API_BASE_URL)
  const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${apiUrl.host}/api/realtime`
}

function sortConversationList(conversations: Conversation[]) {
  return [...conversations].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

function normalizePhoneForWhatsApp(phone?: string) {
  if (!phone) return ''

  let digits = phone.replace(/\D/g, '')

  if (digits.startsWith('55') && digits.length === 12) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4)
  }

  return digits
}

function formatPhone(phone?: string) {
  if (!phone) return '—'

  const digits = normalizePhoneForWhatsApp(phone)

  if (digits.startsWith('55') && digits.length === 13) {
    const country = digits.slice(0, 2)
    const ddd = digits.slice(2, 4)
    const first = digits.slice(4, 9)
    const second = digits.slice(9)
    return `+${country} (${ddd}) ${first}-${second}`
  }

  if (digits.startsWith('55') && digits.length === 12) {
    const country = digits.slice(0, 2)
    const ddd = digits.slice(2, 4)
    const first = digits.slice(4, 8)
    const second = digits.slice(8)
    return `+${country} (${ddd}) ${first}-${second}`
  }

  return phone
}

function canCurrentUserSeeConversation(
  conversation: Conversation,
  currentUser: CurrentUser | null
) {
  if (!currentUser) return false

  if (currentUser.role === 'master') return true
  if (currentUser.role === 'admin') return true
  if (currentUser.role === 'manager') return true

  if (currentUser.role === 'agent') {
    return !conversation.assignedUser || conversation.assignedUser.id === currentUser.id
  }

  return false
}

function applyConversationRealtimeUpdate(
  conversations: Conversation[],
  payload: ConversationRealtimePayload,
  currentUser: CurrentUser | null
) {
  const existingConversation = conversations.find((conversation) => conversation.id === payload.id)

  if (!existingConversation) {
    return {
      nextConversations: conversations,
      foundConversation: false,
      shouldReload: !!currentUser
    }
  }

  const updatedConversation: Conversation = {
    ...existingConversation,
    mode: payload.mode,
    status: payload.status,
    updatedAt: payload.updatedAt,
    assignedAt: payload.assignedAt,
    waitingSince: payload.waitingSince,
    firstResponseAt: payload.firstResponseAt,
    closedAt: payload.closedAt,
    priority: payload.priority ?? existingConversation.priority,
    subject: payload.subject ?? existingConversation.subject,
    metaThreadId: payload.metaThreadId ?? existingConversation.metaThreadId,
    assignedUser: payload.assignedUser ?? null,
    phoneNumber: payload.phoneNumber
  }

  if (!canCurrentUserSeeConversation(updatedConversation, currentUser)) {
    return {
      nextConversations: conversations.filter((conversation) => conversation.id !== payload.id),
      foundConversation: true,
      shouldReload: false
    }
  }

  const nextConversations = sortConversationList(
    conversations.map((conversation) => {
      if (conversation.id !== payload.id) {
        return conversation
      }

      return updatedConversation
    })
  )

  return {
    nextConversations,
    foundConversation: true,
    shouldReload: false
  }
}

function applyRealtimeMessageToConversationList(
  conversations: Conversation[],
  message: Message
) {
  const existingConversation = conversations.find(
    (conversation) => conversation.id === message.conversationId
  )

  if (!existingConversation) {
    return {
      nextConversations: conversations,
      foundConversation: false
    }
  }

  const nextConversations = sortConversationList(
    conversations.map((conversation) => {
      if (conversation.id !== message.conversationId) {
        return conversation
      }

      return {
        ...conversation,
        lastMessage: message,
        updatedAt: message.createdAt
      }
    })
  )

  return {
    nextConversations,
    foundConversation: true
  }
}

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [myPresence, setMyPresence] = useState<PresenceUser | null>(null)
  const [updatingPresence, setUpdatingPresence] = useState(false)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [lead, setLead] = useState<Lead | null>(null)
  const [leadsMap, setLeadsMap] = useState<Record<string, Lead>>({})
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [changingMode, setChangingMode] = useState(false)
  const [assigningConversationId, setAssigningConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function handleLogout() {
    logout().finally(() => {
      window.location.replace('/')
    })
  }

 function upsertMessage(message: Message) {
  setMessages((prev) => {
    const existingIndex = prev.findIndex((item) => item.id === message.id)

    if (existingIndex === -1) {
      return [...prev, message]
    }

    const next = [...prev]
    next[existingIndex] = {
      ...next[existingIndex],
      ...message
    }

    return next
  })
}

  async function loadConversations() {
    const data = await getConversations()
    setConversations(data)

    const leadsEntries = await Promise.all(
      data.map(async (conversation) => {
        const conversationLead = await getLead(conversation.id)
        return [conversation.leadId, conversationLead as Lead]
      })
    )

    setLeadsMap(Object.fromEntries(leadsEntries))

    if (!selectedConversationId && data.length > 0) {
      setSelectedConversationId(data[0].id)
    }

    if (
      selectedConversationId &&
      !data.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(data[0]?.id ?? null)
    }

    return data
  }

  async function loadConversationDetails(conversationId: string) {
    const [messagesResponse, ld] = await Promise.all([
      getMessages(conversationId, { limit: INITIAL_MESSAGES_LIMIT }),
      getLead(conversationId)
    ])

    setMessages(messagesResponse.items)
    setHasMoreMessages(messagesResponse.hasMore)
    setNextCursor(messagesResponse.nextCursor)
    setLead(ld)
  }

  async function loadOlderMessages() {
    if (!selectedConversationId || !hasMoreMessages || !nextCursor || loadingOlderMessages) {
      return
    }

    try {
      setLoadingOlderMessages(true)

      const response = await getMessages(selectedConversationId, {
        limit: INITIAL_MESSAGES_LIMIT,
        before: nextCursor
      })

      setMessages((prev) => {
        const existingIds = new Set(prev.map((item) => item.id))
        const olderUnique = response.items.filter((item) => !existingIds.has(item.id))
        return [...olderUnique, ...prev]
      })

      setHasMoreMessages(response.hasMore)
      setNextCursor(response.nextCursor)
    } finally {
      setLoadingOlderMessages(false)
    }
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true)

        const auth = await getCurrentUser()

        if (!auth?.user) {
          window.location.replace('/')
          return
        }

        setCurrentUser(auth.user)

        const presenceData = await getMyPresence()
        setMyPresence(presenceData)

        if (
          auth.user.role === 'admin' ||
          auth.user.role === 'manager' ||
          auth.user.role === 'master'
        ) {
          const usersData = await getUsers()
          setUsers(usersData)
        } else {
          setUsers([])
        }

        const data = await loadConversations()

        if (data.length > 0) {
          const firstSelectedId = selectedConversationId ?? data[0].id
          await loadConversationDetails(firstSelectedId)
        } else {
          setMessages([])
          setLead(null)
          setHasMoreMessages(false)
          setNextCursor(null)
        }
      } catch (error) {
        console.error('Erro ao carregar dashboard:', error)
        window.location.replace('/')
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      setLead(null)
      setHasMoreMessages(false)
      setNextCursor(null)
      return
    }

    loadConversationDetails(selectedConversationId)
  }, [selectedConversationId])

  useEffect(() => {
    if (!selectedConversationId) {
      if (conversations.length > 0) {
        setSelectedConversationId(conversations[0].id)
      }
      return
    }

    const stillExists = conversations.some(
      (conversation) => conversation.id === selectedConversationId
    )

    if (!stillExists) {
      setSelectedConversationId(conversations[0]?.id ?? null)
    }
  }, [conversations, selectedConversationId])

  useEffect(() => {
    if (!successMessage && !errorMessage) return

    const timeout = setTimeout(() => {
      setSuccessMessage(null)
      setErrorMessage(null)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [successMessage, errorMessage])

  useEffect(() => {
    if (!currentUser) return

    let socket: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let isUnmounted = false

    const connect = () => {
      if (isUnmounted) return

      socket = new WebSocket(getWebSocketUrl())

      socket.onopen = () => {
        console.log('Realtime websocket conectado')
      }

      socket.onmessage = async (event) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeEvent

          if (parsed.type === 'message:new' && parsed.payload) {
            const incomingMessage = parsed.payload

            if (incomingMessage.conversationId === selectedConversationId) {
              upsertMessage(incomingMessage)
            }

            let foundConversation = false

            setConversations((prev) => {
              const result = applyRealtimeMessageToConversationList(prev, incomingMessage)
              foundConversation = result.foundConversation
              return result.nextConversations
            })

            if (!foundConversation) {
              await loadConversations()
            }

            return
          }

          if (
            (parsed.type === 'conversation:mode_changed' ||
              parsed.type === 'conversation:assigned') &&
            parsed.payload
          ) {
            const payload = parsed.payload

            let shouldReload = false

            setConversations((prev) => {
              const result = applyConversationRealtimeUpdate(prev, payload, currentUser)
              shouldReload = result.shouldReload
              return result.nextConversations
            })

            if (shouldReload) {
              await loadConversations()
            }

            if (payload.id === selectedConversationId) {
              const shouldKeepSelected =
                currentUser.role === 'master' ||
                currentUser.role === 'admin' ||
                currentUser.role === 'manager' ||
                !payload.assignedUser ||
                payload.assignedUser.id === currentUser.id

              if (shouldKeepSelected) {
                await loadConversationDetails(payload.id)
              }
            }

            return
          }

          if (parsed.type === 'connected') {
            console.log('Realtime conectado:', parsed)
          }
        } catch (error) {
          console.error('Erro ao processar evento realtime:', error)
        }
      }

      socket.onerror = (error) => {
        console.error('Erro na conexão websocket realtime:', error)
      }

      socket.onclose = () => {
        if (isUnmounted) return

        reconnectTimeout = setTimeout(() => {
          connect()
        }, 2000)
      }
    }

    connect()

    return () => {
      isUnmounted = true

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }

      socket?.close()
    }
  }, [currentUser, selectedConversationId])

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null

  const mobileLeadPhone = normalizePhoneForWhatsApp(lead?.phone)
const mobileLeadPhoneFormatted = formatPhone(lead?.phone)
const mobileLeadWhatsAppLink = mobileLeadPhone
  ? `https://wa.me/${mobileLeadPhone}`
  : null  

  async function handleSendMessage(payload: SendTextMessagePayload) {
    if (!selectedConversationId) return

    try {
      setErrorMessage(null)

      const newMessage = await sendMessage(selectedConversationId, payload)
      upsertMessage(newMessage)
      await loadConversations()
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao enviar mensagem')
    }
  }

  async function handleChangeMode(mode: ConversationMode) {
    if (!selectedConversationId) return

    try {
      setChangingMode(true)
      setErrorMessage(null)

      await updateConversationMode(selectedConversationId, mode)
      await loadConversations()
      await loadConversationDetails(selectedConversationId)

      setSuccessMessage(mode === 'manual' ? 'Modo alterado para manual' : 'Modo alterado para IA')
    } catch (error) {
      console.error('Erro ao alterar modo:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao alterar modo')
    } finally {
      setChangingMode(false)
    }
  }

  async function handleAssignConversation(
    conversationId: string,
    targetUserId?: string | null
  ) {
    try {
      setAssigningConversationId(conversationId)
      setErrorMessage(null)

      await assignConversation(
        conversationId,
        targetUserId === undefined ? undefined : { userId: targetUserId }
      )
      await loadConversations()

      if (!selectedConversationId) {
        setSelectedConversationId(conversationId)
      }

      if (targetUserId === null) {
        setSuccessMessage('Conversa devolvida para fila')
      } else if (targetUserId === undefined) {
        setSuccessMessage('Conversa assumida com sucesso')
      } else {
        setSuccessMessage('Conversa redistribuída com sucesso')
      }
    } catch (error) {
      console.error('Erro ao atribuir conversa:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao atribuir conversa')
    } finally {
      setAssigningConversationId(null)
    }
  }

  async function handleUpdatePresence(status: PresenceStatus) {
    try {
      setUpdatingPresence(true)
      setErrorMessage(null)

      const updated = await updateMyPresence(status)
      setMyPresence(updated)

      setSuccessMessage(
        status === 'available'
          ? 'Você está disponível para atendimento'
          : 'Você foi colocado em pausa'
      )
    } catch (error) {
      console.error('Erro ao atualizar presença:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao atualizar presença')
    } finally {
      setUpdatingPresence(false)
    }
  }

  function handleSelectConversation(id: string) {
    setSelectedConversationId(id)
    setMobileView('chat')
  }

  function handleBack() {
    setMobileView('list')
  }

  const currentUserRole = currentUser?.role ?? 'agent'
  const currentUserId = currentUser?.id ?? ''

  if (loading) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#0b141a] text-white">
        Carregando...
      </main>
    )
  }

  if (!selectedConversation) {
    return (
      <main className="flex h-screen bg-[#0b141a] text-white">
        <div className="hidden h-full w-full md:grid md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_340px]">
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            leadsMap={leadsMap}
            currentUserRole={currentUserRole}
            currentUserId={currentUserId}
            onAssignConversation={handleAssignConversation}
            assigningConversationId={assigningConversationId}
          />

          <section className="flex items-center justify-center border-l border-neutral-800">
            <div className="rounded-2xl bg-[#111b21] px-6 py-4 text-sm text-neutral-400">
              Sem conversa liberada para você.
            </div>
          </section>

          <div className="hidden border-l border-neutral-800 xl:block" />
        </div>

        <div className="flex h-full w-full flex-col md:hidden">
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            leadsMap={leadsMap}
            currentUserRole={currentUserRole}
            currentUserId={currentUserId}
            onAssignConversation={handleAssignConversation}
            assigningConversationId={assigningConversationId}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="flex h-screen flex-col bg-[#0b141a] text-white">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="text-sm font-medium">FlyHub AI</div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-neutral-400">
            {currentUser?.name} ({currentUser?.role})
          </span>

          <button
            onClick={handleLogout}
            className="rounded-md bg-red-600 px-3 py-1 hover:bg-red-700"
          >
            Sair
          </button>
        </div>
      </header>

      {(successMessage || errorMessage) && (
        <div className="px-4 py-2">
          {successMessage && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      <div className="hidden flex-1 md:grid md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_340px]">
        <ConversationList
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          leadsMap={leadsMap}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
          onAssignConversation={handleAssignConversation}
          assigningConversationId={assigningConversationId}
        />

        <ChatWindow
          selectedConversation={selectedConversation}
          messages={messages}
          lead={lead}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          users={users}
          myPresence={myPresence}
          updatingPresence={updatingPresence}
          onUpdatePresence={handleUpdatePresence}
          onSendMessage={handleSendMessage}
          onChangeMode={handleChangeMode}
          onAssignConversation={handleAssignConversation}
          assigningConversation={assigningConversationId === selectedConversation.id}
          changingMode={changingMode}
          hasMoreMessages={hasMoreMessages}
          loadingOlderMessages={loadingOlderMessages}
          onLoadOlderMessages={loadOlderMessages}
        />

        <div className="hidden h-full xl:block">{lead ? <LeadSidebar lead={lead} /> : null}</div>
      </div>

      <div className="flex flex-1 flex-col md:hidden">
        {mobileView === 'list' && (
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            leadsMap={leadsMap}
            currentUserRole={currentUserRole}
            currentUserId={currentUserId}
            onAssignConversation={handleAssignConversation}
            assigningConversationId={assigningConversationId}
          />
        )}

          {mobileView === 'chat' && (
  <>
    {lead && mobileLeadWhatsAppLink ? (
      <div className="border-b border-neutral-800 bg-[#111b21] px-4 py-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Telefone:</span>

          <a
            href={mobileLeadWhatsAppLink}
            target="_blank"
            rel="noreferrer"
            className="text-[#53bdeb] underline underline-offset-2"
          >
            {mobileLeadPhoneFormatted}
          </a>
        </div>
      </div>
    ) : null}

    <ChatWindow
      selectedConversation={selectedConversation}
      messages={messages}
      lead={lead}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      users={users}
      myPresence={myPresence}
      updatingPresence={updatingPresence}
      onUpdatePresence={handleUpdatePresence}
      onBack={handleBack}
      onSendMessage={handleSendMessage}
      onChangeMode={handleChangeMode}
      onAssignConversation={handleAssignConversation}
      assigningConversation={assigningConversationId === selectedConversation.id}
      changingMode={changingMode}
      hasMoreMessages={hasMoreMessages}
      loadingOlderMessages={loadingOlderMessages}
      onLoadOlderMessages={loadOlderMessages}
    />
  </>
)}
      </div>
    </main>
  )
}