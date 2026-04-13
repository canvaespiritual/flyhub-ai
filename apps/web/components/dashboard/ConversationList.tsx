import type { Conversation, Lead, UserRole } from '@flyhub/shared'
import { getMessagePreview } from '@/lib/chat/message-utils'

type Props = {
  conversations: Conversation[]
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
  leadsMap: Record<string, Lead>
  currentUserRole: UserRole
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

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  leadsMap,
  currentUserRole,
  onAssignConversation,
  assigningConversationId = null
}: Props) {
  return (
    <aside className="border-r border-neutral-800 bg-[#111b21]">
      <div className="border-b border-neutral-800 px-4 py-4">
        <h1 className="text-xl font-semibold text-white">Inbox</h1>
      </div>

      <div className="space-y-1 px-2 pb-2">
        {conversations.map((conversation) => {
          const isSelected = conversation.id === selectedConversationId
          const lead = leadsMap[conversation.leadId]
          const canAssume = currentUserRole === 'agent' && !conversation.assignedUser
          const isAssigning = assigningConversationId === conversation.id

          return (
            <button
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              className={`w-full rounded-2xl p-3 text-left transition ${
                isSelected ? 'bg-[#202c33]' : 'hover:bg-[#202c33]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">
                    {lead?.name ?? lead?.phone ?? 'Carregando...'}
                  </p>

                  <p className="mt-1 truncate text-sm text-neutral-400">
                    {conversation.lastMessage
                      ? getMessagePreview(conversation.lastMessage)
                      : 'Sem mensagens'}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        conversation.mode === 'ai'
                          ? 'bg-violet-500/15 text-violet-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {conversation.mode === 'ai' ? 'IA' : 'Manual'}
                    </span>

                    <span className="rounded-full bg-white/5 px-2 py-0.5">
                      {getConversationStatusLabel(conversation.status)}
                    </span>

                    <span className="rounded-full bg-white/5 px-2 py-0.5">
                      {getChannelLabel(conversation.channel)}
                    </span>

                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        conversation.priority === 'high'
                          ? 'bg-red-500/15 text-red-300'
                          : conversation.priority === 'low'
                            ? 'bg-sky-500/15 text-sky-300'
                            : 'bg-white/5'
                      }`}
                    >
                      Prioridade {getPriorityLabel(conversation.priority)}
                    </span>

                    {conversation.assignedUser?.name ? (
                      <span className="truncate rounded-full bg-white/5 px-2 py-0.5">
                        {conversation.assignedUser.name}
                      </span>
                    ) : (
                      <span className="truncate rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                        Sem responsável
                      </span>
                    )}

                    {conversation.phoneNumber?.label && (
                      <span className="truncate rounded-full bg-white/5 px-2 py-0.5">
                        {conversation.phoneNumber.label}
                      </span>
                    )}
                  </div>

                  {canAssume && (
                    <div className="mt-3">
                      <button
                        type="button"
                        disabled={isAssigning}
                        onClick={async (event) => {
                          event.stopPropagation()
                          await onAssignConversation(conversation.id)
                        }}
                        className="rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isAssigning ? 'Assumindo...' : 'Assumir'}
                      </button>
                    </div>
                  )}
                </div>

                {conversation.unreadCount > 0 && (
                  <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-black">
                    {conversation.unreadCount}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}