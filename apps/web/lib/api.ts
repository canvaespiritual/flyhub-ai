import type {
  Conversation,
  ConversationMode,
  Lead,
  Message,
  UserRole
} from '@flyhub/shared'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api'
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID!

export type SendMessagePayload = {
  senderUserId?: string
  type: 'text' | 'audio' | 'image' | 'document'
  content?: string
}

export type GetMessagesResponse = {
  items: Message[]
  hasMore: boolean
  nextCursor: string | null
}

export type GetMessagesParams = {
  limit?: number
  before?: string | null
}

export type UpdateConversationModeResponse = {
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

export type AssignConversationPayload = {
  userId?: string | null
  assignedByUserId?: string
  reason?: string
}

export type AssignConversationResponse = {
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

export type ApiError = Error & {
  code?: string
  requiresTemplate?: boolean
  status?: number
}

async function parseApiError(res: Response, fallbackMessage: string): Promise<ApiError> {
  let payload: unknown = null

  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  const error = new Error(
    typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string'
      ? payload.message
      : fallbackMessage
  ) as ApiError

  if (typeof payload === 'object' && payload !== null) {
    if ('code' in payload && typeof payload.code === 'string') {
      error.code = payload.code
    }

    if ('requiresTemplate' in payload && typeof payload.requiresTemplate === 'boolean') {
      error.requiresTemplate = payload.requiresTemplate
    }
  }

  error.status = res.status

  return error
}

export async function getConversations(
  currentUserId: string,
  currentUserRole: UserRole
): Promise<Conversation[]> {
  const searchParams = new URLSearchParams({
    tenantId: TENANT_ID,
    currentUserId,
    currentUserRole
  })

  const res = await fetch(`${API_BASE_URL}/conversations?${searchParams.toString()}`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar conversas')
  }

  return res.json()
}

export async function getMessages(
  conversationId: string,
  params?: GetMessagesParams
): Promise<GetMessagesResponse> {
  const searchParams = new URLSearchParams({
    tenantId: TENANT_ID
  })

  if (params?.limit) {
    searchParams.set('limit', String(params.limit))
  }

  if (params?.before) {
    searchParams.set('before', params.before)
  }

  const res = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}/messages?${searchParams.toString()}`,
    { cache: 'no-store' }
  )

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar mensagens')
  }

  return res.json()
}

export async function getLead(conversationId: string): Promise<Lead | null> {
  const res = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}/lead?tenantId=${TENANT_ID}`,
    { cache: 'no-store' }
  )

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar lead')
  }

  return res.json()
}

export async function updateConversationMode(
  conversationId: string,
  mode: ConversationMode
): Promise<UpdateConversationModeResponse> {
  const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}/mode`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      mode
    })
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar modo da conversa')
  }

  return res.json()
}

export async function assignConversation(
  conversationId: string,
  payload: AssignConversationPayload
): Promise<AssignConversationResponse> {
  const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}/assign`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      userId: payload.userId ?? null,
      assignedByUserId: payload.assignedByUserId,
      reason: payload.reason
    })
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atribuir conversa')
  }

  return res.json()
}

export async function sendMessage(
  conversationId: string,
  payload: SendMessagePayload
): Promise<Message> {
  const res = await fetch(`${API_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      conversationId,
      senderUserId: payload.senderUserId,
      type: payload.type,
      content: payload.content
    })
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao enviar mensagem')
  }

  return res.json()
}