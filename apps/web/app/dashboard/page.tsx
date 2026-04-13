'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Conversation, ConversationMode, Lead, Message, UserRole } from '@flyhub/shared'
import { ChatWindow } from '@/components/dashboard/ChatWindow'
import { ConversationList } from '@/components/dashboard/ConversationList'
import { LeadSidebar } from '@/components/dashboard/LeadSidebar'
import {
  assignConversation,
  getConversations,
  getMessages,
  getLead,
  sendMessage,
  updateConversationMode
} from '@/lib/api'

type SendTextMessagePayload = {
  senderUserId?: string
  type: 'text'
  content: string
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

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID
const CURRENT_USER_ID = process.env.NEXT_PUBLIC_CURRENT_USER_ID
const CURRENT_USER_ROLE = (process.env.NEXT_PUBLIC_CURRENT_USER_ROLE ?? 'agent') as UserRole
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api'
const INITIAL_MESSAGES_LIMIT = 20

export default function DashboardPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
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

  const realtimeUrl = useMemo(() => {
    if (!TENANT_ID) return null
    return `${API_BASE_URL}/realtime?tenantId=${encodeURIComponent(TENANT_ID)}`
  }, [])

  function appendMessageIfMissing(message: Message) {
    setMessages((prev) => {
      if (prev.some((item) => item.id === message.id)) {
        return prev
      }

      return [...prev, message]
    })
  }

  function upsertConversationRealtimeUpdate(payload: ConversationRealtimePayload) {
    setConversations((prev) => {
      const exists = prev.some((conversation) => conversation.id === payload.id)

      if (!exists) {
        return prev
      }

      const updated = prev.map((conversation) => {
        if (conversation.id !== payload.id) {
          return conversation
        }

        return {
          ...conversation,
          mode: payload.mode,
          status: payload.status,
          updatedAt: payload.updatedAt,
          assignedAt: payload.assignedAt,
          waitingSince: payload.waitingSince,
          firstResponseAt: payload.firstResponseAt,
          closedAt: payload.closedAt,
          priority: payload.priority ?? conversation.priority,
          subject: payload.subject ?? conversation.subject,
          metaThreadId: payload.metaThreadId ?? conversation.metaThreadId,
          assignedUser: payload.assignedUser ?? null,
          phoneNumber: payload.phoneNumber
        }
      })

      updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      return updated
    })
  }

  async function loadConversations() {
    if (!CURRENT_USER_ID || !CURRENT_USER_ROLE) {
      setConversations([])
      setLeadsMap({})
      return []
    }

    const data = await getConversations(CURRENT_USER_ID, CURRENT_USER_ROLE)
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

    if (selectedConversationId && !data.some((conversation) => conversation.id === selectedConversationId)) {
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

  async function refreshCurrentData() {
    const data = await loadConversations()

    if (selectedConversationId && data.some((conversation) => conversation.id === selectedConversationId)) {
      await loadConversationDetails(selectedConversationId)
      return
    }

    if (data[0]?.id) {
      await loadConversationDetails(data[0].id)
    } else {
      setMessages([])
      setLead(null)
      setHasMoreMessages(false)
      setNextCursor(null)
    }
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true)
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
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  useEffect(() => {
    if (!selectedConversationId) return
    loadConversationDetails(selectedConversationId)
  }, [selectedConversationId])

  useEffect(() => {
    if (!realtimeUrl) return

    const eventSource = new EventSource(realtimeUrl)

    const handleMessage = async (event: Event) => {
  const messageEvent = event as MessageEvent<string>
      try {
        const parsed = JSON.parse(messageEvent.data) as RealtimeEvent

        if (parsed.type === 'message:new' && parsed.payload) {
          const incomingMessage = parsed.payload

          if (incomingMessage.conversationId === selectedConversationId) {
            appendMessageIfMissing(incomingMessage)
          }

          await loadConversations()
          return
        }

        if (
          (parsed.type === 'conversation:mode_changed' ||
            parsed.type === 'conversation:assigned') &&
          parsed.payload
        ) {
          const payload = parsed.payload

          upsertConversationRealtimeUpdate(payload)

          if (payload.id === selectedConversationId) {
            await loadConversationDetails(payload.id)
          }

          return
        }
      } catch (error) {
        console.error('Erro ao processar evento SSE:', error)
      }
    }

    const handleConnected = (event: Event) => {
  const messageEvent = event as MessageEvent<string>
      try {
        const parsed = JSON.parse(messageEvent.data) as RealtimeEvent
        console.log('Realtime conectado:', parsed)
      } catch {
        console.log('Realtime conectado')
      }
    }

    eventSource.addEventListener('message', handleMessage)
eventSource.addEventListener('connected', handleConnected)

    eventSource.onerror = (error) => {
      console.error('Erro na conexão realtime:', error)
    }

    return () => {
      eventSource.removeEventListener('message', handleMessage)
eventSource.removeEventListener('connected', handleConnected)
      eventSource.close()
    }
  }, [realtimeUrl, selectedConversationId])

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshCurrentData()
    }, 15000)

    return () => {
      window.clearInterval(interval)
    }
  }, [selectedConversationId])

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null

  async function handleSendMessage(payload: SendTextMessagePayload) {
    if (!selectedConversationId) return

    const newMessage = await sendMessage(selectedConversationId, payload)

    appendMessageIfMissing(newMessage)
    await loadConversations()
  }

  async function handleChangeMode(mode: ConversationMode) {
    if (!selectedConversationId) return

    try {
      setChangingMode(true)
      await updateConversationMode(selectedConversationId, mode)
      await loadConversations()
      await loadConversationDetails(selectedConversationId)
    } finally {
      setChangingMode(false)
    }
  }

  async function handleAssignConversation(conversationId: string) {
    if (!CURRENT_USER_ID) return

    try {
      setAssigningConversationId(conversationId)

      await assignConversation(conversationId, {
        userId: CURRENT_USER_ID,
        assignedByUserId: CURRENT_USER_ID,
        reason: 'Assumido manualmente pelo atendente'
      })

      await loadConversations()

      if (!selectedConversationId) {
        setSelectedConversationId(conversationId)
      }
    } finally {
      setAssigningConversationId(null)
    }
  }

  function handleSelectConversation(id: string) {
    setSelectedConversationId(id)
    setMobileView('chat')
  }

  function handleBack() {
    setMobileView('list')
  }

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
        <div className="hidden h-full md:grid md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_340px] w-full">
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            leadsMap={leadsMap}
            currentUserRole={CURRENT_USER_ROLE}
            onAssignConversation={handleAssignConversation}
            assigningConversationId={assigningConversationId}
          />

          <section className="flex items-center justify-center border-l border-neutral-800">
            <div className="rounded-2xl bg-[#111b21] px-6 py-4 text-sm text-neutral-400">
              Sem conversa liberada para você.
            </div>
          </section>

          <div className="hidden xl:block border-l border-neutral-800" />
        </div>

        <div className="flex h-full w-full flex-col md:hidden">
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            leadsMap={leadsMap}
            currentUserRole={CURRENT_USER_ROLE}
            onAssignConversation={handleAssignConversation}
            assigningConversationId={assigningConversationId}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen bg-[#0b141a]">
      <div className="hidden h-full md:grid md:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_340px]">
        <ConversationList
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          leadsMap={leadsMap}
          currentUserRole={CURRENT_USER_ROLE}
          onAssignConversation={handleAssignConversation}
          assigningConversationId={assigningConversationId}
        />

        <ChatWindow
          selectedConversation={selectedConversation}
          messages={messages}
          lead={lead}
          onSendMessage={handleSendMessage}
          onChangeMode={handleChangeMode}
          changingMode={changingMode}
          hasMoreMessages={hasMoreMessages}
          loadingOlderMessages={loadingOlderMessages}
          onLoadOlderMessages={loadOlderMessages}
        />

        <div className="hidden xl:block">
  {lead ? <LeadSidebar lead={lead} /> : null}
</div>
      </div>

      <div className="flex h-full flex-col md:hidden">
        {mobileView === 'list' && (
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            leadsMap={leadsMap}
            currentUserRole={CURRENT_USER_ROLE}
            onAssignConversation={handleAssignConversation}
            assigningConversationId={assigningConversationId}
          />
        )}

        {mobileView === 'chat' && (
          <ChatWindow
            selectedConversation={selectedConversation}
            messages={messages}
            lead={lead}
            onBack={handleBack}
            onSendMessage={handleSendMessage}
            onChangeMode={handleChangeMode}
            changingMode={changingMode}
            hasMoreMessages={hasMoreMessages}
            loadingOlderMessages={loadingOlderMessages}
            onLoadOlderMessages={loadOlderMessages}
          />
        )}
      </div>
    </main>
  )
}