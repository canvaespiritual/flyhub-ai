import { useEffect, useMemo, useState } from 'react'
import type { Conversation, Lead, UserRole } from '@flyhub/shared'
import { getMessagePreview } from '@/lib/chat/message-utils'
import { deleteConversation } from '@/lib/api'

type Props = {
  conversations: Conversation[]
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
  leadsMap: Record<string, Lead>
  currentUserRole: UserRole
  currentUserId: string
  onAssignConversation: (conversationId: string) => Promise<void>
  assigningConversationId?: string | null
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

function getPriorityLabel(priority?: Conversation['priority']) {
  switch (priority) {
    case 'high':
      return 'Alta'
    case 'low':
      return 'Baixa'
    case 'normal':
    default:
      return 'Normal'
  }
}

function getChannelLabel(channel: Conversation['channel']) {
  switch (channel) {
    case 'webchat':
      return 'Webchat'
    case 'instagram':
      return 'Instagram'
    case 'facebook':
      return 'Facebook'
    case 'whatsapp':
    default:
      return 'WhatsApp'
  }
}

function canCurrentUserOperateConversation(
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

function canCurrentUserAssumeConversation(
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

function getConversationRank(
  conversation: Conversation,
  currentUserId: string
) {
  const sla = getSlaInfo(conversation)
  const isUnassigned = !conversation.assignedUser
  const isOwnedByCurrentUser = conversation.assignedUser?.id === currentUserId

  if (sla?.level === 'expired') return 0
  if (sla?.level === 'warning') return 1
  if (isUnassigned) return 2
  if (isOwnedByCurrentUser) return 3
  return 4
}

function sortConversationsForOperation(
  conversations: Conversation[],
  currentUserId: string
) {
  return [...conversations].sort((a, b) => {
    const rankA = getConversationRank(a, currentUserId)
    const rankB = getConversationRank(b, currentUserId)

    if (rankA !== rankB) {
      return rankA - rankB
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  leadsMap,
  currentUserRole,
  currentUserId,
  onAssignConversation,
  assigningConversationId = null
}: Props) {
  const [, forceUpdate] = useState(0)
const [search, setSearch] = useState('')
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate((v) => v + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

 const filteredConversations = useMemo(() => {
  if (!search.trim()) return conversations

  const term = search.toLowerCase()

  return conversations.filter((conversation) => {
    const lead = leadsMap[conversation.leadId]

    return (
      lead?.name?.toLowerCase().includes(term) ||
      lead?.phone?.toLowerCase().includes(term)
    )
  })
}, [conversations, search, leadsMap])

const orderedConversations = useMemo(() => {
  return sortConversationsForOperation(filteredConversations, currentUserId)
}, [filteredConversations, currentUserId])

  return (
    <aside className="border-r border-neutral-800 bg-[#111b21]">
      <div className="border-b border-neutral-800 px-4 py-4 space-y-3">
  <h1 className="text-xl font-semibold text-white">Inbox</h1>

  <input
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Buscar por nome ou telefone..."
    className="w-full rounded-lg bg-[#202c33] px-3 py-2 text-sm text-white outline-none"
  />
</div>

      <div className="space-y-1 px-2 pb-2">
        {orderedConversations.map((conversation) => {
          const isSelected = conversation.id === selectedConversationId
          const isUnread = conversation.unreadCount > 0
          const lead = leadsMap[conversation.leadId]
          const canOperate = canCurrentUserOperateConversation(
            conversation,
            currentUserRole,
            currentUserId
          )
          const canAssume = canCurrentUserAssumeConversation(
            conversation,
            currentUserRole,
            currentUserId
          )
          const isAssigning = assigningConversationId === conversation.id
          const isOwnedByCurrentUser = conversation.assignedUser?.id === currentUserId
          const sla = getSlaInfo(conversation)

          return (
            <div
              key={conversation.id}
              className={`rounded-2xl transition ${
  isSelected
    ? 'bg-[#202c33]'
    : isUnread
      ? 'bg-[#1f2c34] hover:bg-[#2a3942]'
      : 'hover:bg-[#202c33]'
}`}
            >
              <button
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className="w-full p-3 text-left"
              >
                <div className="flex items-center gap-3">
  {/* Avatar */}
  <div className="w-12 h-12 rounded-full bg-[#202c33] flex items-center justify-center text-white font-semibold">
    {lead?.name?.charAt(0)?.toUpperCase() ?? '?'}
  </div>

  {/* Conteúdo */}
  <div className="flex-1 min-w-0">
    {/* Linha 1: Nome + Hora */}
    <div className="flex items-center justify-between">
      <p className={`truncate font-medium ${isUnread ? 'text-white' : 'text-neutral-300'}`}>
        {lead?.name ?? lead?.phone ?? 'Carregando...'}
      </p>

      <span className="text-[11px] text-neutral-500 ml-2 whitespace-nowrap">
        {conversation.lastMessage?.createdAt
          ? new Date(conversation.lastMessage.createdAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit'
            })
          : ''}
      </span>
    </div>

    {/* Linha 2: Preview + badge */}
    <div className="flex items-center justify-between mt-1">
      <p className="truncate text-sm text-neutral-400">
        {conversation.lastMessage
          ? getMessagePreview(conversation.lastMessage)
          : 'Sem mensagens'}
      </p>

      {conversation.unreadCount > 0 && (
        <div className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-black">
          {conversation.unreadCount}
        </div>
      )}
    </div>
  </div>

  {/* Botão delete (mantido) */}
  {(currentUserRole === 'master' || currentUserRole === 'admin') && (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()

        const confirmDelete = confirm('Apagar esta conversa?')
        if (!confirmDelete) return

        await deleteConversation(conversation.id)
        window.location.reload()
      }}
      className="text-xs text-red-400 hover:text-red-300 ml-2"
    >
      🗑
    </button>
  )}
</div>
                        </button>

                      {canAssume && (
                      <div className="px-3 pb-3">
                      <button
                        type="button"
                       disabled={isAssigning}
                         onClick={async () => {
                          await onAssignConversation(conversation.id)
                           }}
                           className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                               {isAssigning ? 'Assumindo...' : 'Assumir'}
                         </button>
                        </div>
                       )}
                     </div>
                     )
                   })}
                 </div>
                 </aside>
  )
}