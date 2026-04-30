import type {
  Conversation,
  ConversationMode,
  Lead,
  Message
} from '@flyhub/shared'

const API_BASE_URL =
  process.env.NODE_ENV === 'production'
    ? '/api-proxy'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api'

export type SendMessagePayload = {
  type: 'text' | 'audio' | 'image' | 'document' | 'video'
  content?: string
}

export type SendMediaMessagePayload = {
  type: 'audio' | 'image' | 'document' | 'video'
  file: File
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

export type AssignConversationPayload = {
  userId?: string | null
  reason?: string
}

export type ApiError = Error & {
  code?: string
  requiresTemplate?: boolean
  status?: number
}

export type CampaignStepType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'link'

  export type CampaignStepMediaUploadResponse = {
  mediaUrl: string
  storageKey: string
  mimeType: string
  fileName: string
}
export type CampaignInitialStepPayload = {
  order: number
  type: CampaignStepType
  content?: string | null
  mediaUrl?: string | null
  storageKey?: string | null
  mimeType?: string | null
  fileName?: string | null
  delaySeconds?: number
  isActive?: boolean
}

export type CampaignPayload = {
  name: string
  phoneNumberId: string
  managerId?: string | null
  metaAdId?: string | null
  ref?: string | null
  fallbackText?: string | null
  initialPrompt?: string | null
  isActive?: boolean
  initialSteps?: CampaignInitialStepPayload[]
}

async function parseApiError(
  res: Response,
  fallbackMessage: string
): Promise<ApiError> {
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

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'code' in payload &&
    typeof payload.code === 'string'
  ) {
    error.code = payload.code
  }

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'requiresTemplate' in payload &&
    typeof payload.requiresTemplate === 'boolean'
  ) {
    error.requiresTemplate = payload.requiresTemplate
  }

  error.status = res.status
  return error
}

async function apiFetch(url: string, options?: RequestInit) {
  const headers = new Headers(options?.headers)
  const isFormData =
    typeof FormData !== 'undefined' && options?.body instanceof FormData

  if (options?.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  console.log('apiFetch =>', {
    url,
    method: options?.method ?? 'GET',
    body: options?.body,
    isFormData
  })

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers
  })
}

export async function login(email: string, password: string) {
  const res = await apiFetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro no login')
  }

  return res.json()
}

export async function getCurrentUser() {
  const res = await apiFetch(`${API_BASE_URL}/auth/me`)

  if (!res.ok) {
    throw await parseApiError(res, 'Não autenticado')
  }

  return res.json()
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await apiFetch(`${API_BASE_URL}/conversations`, {
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
  const searchParams = new URLSearchParams()

  if (params?.limit) {
    searchParams.set('limit', String(params.limit))
  }

  if (params?.before) {
    searchParams.set('before', params.before)
  }

  const res = await apiFetch(
    `${API_BASE_URL}/conversations/${conversationId}/messages?${searchParams.toString()}`,
    { cache: 'no-store' }
  )

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar mensagens')
  }

  return res.json()
}

export async function getLead(conversationId: string): Promise<Lead | null> {
  const res = await apiFetch(`${API_BASE_URL}/conversations/${conversationId}/lead`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar lead')
  }

  return res.json()
}

export async function updateConversationMode(
  conversationId: string,
  mode: ConversationMode
) {
  const res = await apiFetch(`${API_BASE_URL}/conversations/${conversationId}/mode`, {
    method: 'PATCH',
    body: JSON.stringify({ mode })
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar modo')
  }

  return res.json()
}

export async function assignConversation(
  conversationId: string,
  payload?: AssignConversationPayload
) {
  const res = await apiFetch(`${API_BASE_URL}/conversations/${conversationId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({
      userId: payload?.userId ?? undefined,
      reason: payload?.reason ?? undefined
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
  const res = await apiFetch(`${API_BASE_URL}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      conversationId,
      type: payload.type,
      content: payload.content
    })
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao enviar mensagem')
  }

  return res.json()
}

export async function sendMediaMessage(
  conversationId: string,
  payload: SendMediaMessagePayload
): Promise<Message> {
  const formData = new FormData()

  formData.append('conversationId', conversationId)
  formData.append('type', payload.type)
  formData.append('file', payload.file)

  if (payload.content?.trim()) {
    formData.append('content', payload.content.trim())
  }

  const res = await apiFetch(`${API_BASE_URL}/messages`, {
    method: 'POST',
    body: formData
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao enviar mídia')
  }

  return res.json()
}

export type User = {
  id: string
  name: string
  email: string
  role: 'master' | 'admin' | 'manager' | 'agent'
  tenantId: string
  isActive: boolean
  managerId?: string
  manager?: {
    id: string
    name: string
    email: string
  }
  presenceStatus: 'available' | 'paused'
  eligibleForAssignment: boolean
}

export type PresenceStatus = 'available' | 'paused'

export type PresenceUser = {
  id: string
  name: string
  email: string
  role: 'master' | 'admin' | 'manager' | 'agent'
  tenantId: string
  isActive: boolean
  presenceStatus: PresenceStatus
}

export type CreateUserPayload = {
  name: string
  email: string
  password: string
  role: 'admin' | 'manager' | 'agent'
  managerId?: string | null
}

export type UpdateUserPayload = {
  name?: string
  email?: string
  password?: string
  role?: 'manager' | 'agent'
  managerId?: string | null
}

export type UpdateUserStatusPayload = {
  isActive: boolean
}

export async function getUsers(
  params?: { status?: 'active' | 'inactive' | 'all' }
): Promise<User[]> {
  const searchParams = new URLSearchParams()

  if (params?.status) {
    searchParams.set('status', params.status)
  }

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''

  const res = await apiFetch(`${API_BASE_URL}/users${suffix}`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar usuários')
  }

  return res.json()
}

export async function getMyPresence(): Promise<PresenceUser> {
  const res = await apiFetch(`${API_BASE_URL}/presence/me`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar presença')
  }

  return res.json()
}

export async function updateMyPresence(
  status: PresenceStatus
): Promise<PresenceUser> {
  const res = await apiFetch(`${API_BASE_URL}/presence/me`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar presença')
  }

  return res.json()
}

export async function logout() {
  const res = await apiFetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao sair')
  }

  return res.json()
}

export async function getCampaigns() {
  const res = await apiFetch(`${API_BASE_URL}/campaigns`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar campanhas')
  }

  return res.json()
}

export async function getCampaignOptions() {
  const res = await apiFetch(`${API_BASE_URL}/campaigns/options`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar opções')
  }

  return res.json()
}

export async function createCampaign(payload: CampaignPayload) {
  const res = await apiFetch(`${API_BASE_URL}/campaigns`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao criar campanha')
  }

  return res.json()
}

export async function updateCampaign(
  campaignId: string,
  payload: CampaignPayload
) {
  const res = await apiFetch(`${API_BASE_URL}/campaigns/${campaignId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar campanha')
  }

  return res.json()
}

export async function uploadCampaignStepMedia(
  file: File,
  type: 'audio' | 'image' | 'document' | 'video'
): Promise<CampaignStepMediaUploadResponse> {
  const formData = new FormData()

  formData.append('type', type)
  formData.append('file', file)

  const res = await apiFetch(`${API_BASE_URL}/campaigns/upload-media`, {
    method: 'POST',
    body: formData
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao enviar mídia da campanha')
  }

  return res.json()
}
export async function deleteConversation(conversationId: string) {
  const res = await apiFetch(`${API_BASE_URL}/conversations/${conversationId}`, {
    method: 'DELETE'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao apagar conversa')
  }

  return res.json()
}
export async function createUser(payload: CreateUserPayload): Promise<User> {
  const res = await apiFetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao criar usuário')
  }

  return res.json()
}

export async function updateUser(
  userId: string,
  payload: UpdateUserPayload
): Promise<User> {
  const res = await apiFetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar usuário')
  }

  return res.json()
}

export async function updateUserStatus(
  userId: string,
  payload: UpdateUserStatusPayload
): Promise<User> {
  const res = await apiFetch(`${API_BASE_URL}/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar status do usuário')
  }

  return res.json()
}

export async function getCampaignDistribution(id: string) {
  const res = await apiFetch(`${API_BASE_URL}/campaigns/${id}/distribution`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    if (res.status === 404) return null
    throw await parseApiError(res, 'Erro ao buscar distribuição')
  }

  return res.json()
}

export async function updateCampaignDistribution(id: string, data: any) {
  const res = await apiFetch(`${API_BASE_URL}/campaigns/${id}/distribution`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao salvar distribuição')
  }

  return res.json()
}

export type PhoneNumberPayload = {
  number: string
  label?: string | null
  managerId?: string | null
  providerAccountId: string
  externalId: string
  accessToken?: string | null
  isActive?: boolean
  isDefault?: boolean
}

export async function getPhoneNumbers() {
  const res = await apiFetch(`${API_BASE_URL}/phone-numbers`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar números')
  }

  return res.json()
}

export async function getPhoneNumberOptions() {
  const res = await apiFetch(`${API_BASE_URL}/phone-numbers/options`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar opções de números')
  }

  return res.json()
}

export async function createPhoneNumber(payload: PhoneNumberPayload) {
  const res = await apiFetch(`${API_BASE_URL}/phone-numbers`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao cadastrar número')
  }

  return res.json()
}

export async function updatePhoneNumber(
  phoneNumberId: string,
  payload: Partial<PhoneNumberPayload>
) {
  const res = await apiFetch(`${API_BASE_URL}/phone-numbers/${phoneNumberId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar número')
  }

  return res.json()
}

export async function activatePhoneNumber(id: string) {
  const res = await apiFetch(`${API_BASE_URL}/phone-numbers/${id}/activate`, {
    method: 'POST'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao ativar número')
  }

  return res.json()
}

export type MasterTenant = {
  id: string
  name: string
  slug?: string
  isActive: boolean
  timezone?: string
  createdAt: string
  updatedAt: string
  usersCount: number
  phoneNumbersCount: number
  campaignsCount: number
  conversationsCount: number
}

export type MasterTenantPayload = {
  name: string
  slug?: string | null
  timezone?: string | null
  isActive?: boolean
}

export async function getMasterTenants(): Promise<MasterTenant[]> {
  const res = await apiFetch(`${API_BASE_URL}/master/tenants`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar operações')
  }

  return res.json()
}

export async function createMasterTenant(
  payload: MasterTenantPayload
): Promise<MasterTenant> {
  const res = await apiFetch(`${API_BASE_URL}/master/tenants`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao criar operação')
  }

  return res.json()
}

export async function updateMasterTenant(
  tenantId: string,
  payload: Partial<MasterTenantPayload>
): Promise<MasterTenant> {
  const res = await apiFetch(`${API_BASE_URL}/master/tenants/${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar operação')
  }

  return res.json()
}

export type AiResourceType =
  | 'LINK'
  | 'AUDIO'
  | 'VIDEO'
  | 'IMAGE'
  | 'PDF'
  | 'DOCUMENT'
  | 'TEXT'

export type AiKnowledgeTableType =
  | 'SIMULATION'
  | 'DOCUMENTS'
  | 'PRICING'
  | 'FAQ'
  | 'CUSTOM'

export type AiFollowupWindowType =
  | 'SERVICE_24H'
  | 'ENTRY_POINT_72H'
  | 'TEMPLATE_AFTER_WINDOW'

export type AiAgentPayload = {
  name: string
  slug?: string | null
  description?: string | null
  isActive?: boolean
  model?: string
  temperature?: number
  maxContextMessages?: number
  objective?: string | null
  tone?: string | null
  basePrompt?: string | null
  safetyRules?: string | null
  handoffRules?: string | null
  businessRules?: string | null
  stages?: any[]
  objections?: any[]
  resources?: any[]
  knowledgeTables?: any[]
  followupRules?: any[]
  successExamples?: any[]
}

export async function getAiAgents() {
  const res = await apiFetch(`${API_BASE_URL}/ai/agents`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar agentes IA')
  }

  return res.json()
}

export async function getAiAgent(agentId: string) {
  const res = await apiFetch(`${API_BASE_URL}/ai/agents/${agentId}`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar agente IA')
  }

  return res.json()
}

export async function createAiAgent(payload: AiAgentPayload) {
  const res = await apiFetch(`${API_BASE_URL}/ai/agents`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao criar agente IA')
  }

  return res.json()
}

export async function updateAiAgent(agentId: string, payload: Partial<AiAgentPayload>) {
  const res = await apiFetch(`${API_BASE_URL}/ai/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao atualizar agente IA')
  }

  return res.json()
}

export async function linkAiAgentToCampaign(payload: {
  campaignId: string
  agentId: string | null
}) {
  const res = await apiFetch(`${API_BASE_URL}/ai/campaign-link`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao vincular IA à campanha')
  }

  return res.json()
}

export type MasterAdmin = {
  id: string
  name: string
  email: string
  tenantId: string
  isActive: boolean
  createdAt: string
  tenant: {
    id: string
    name: string
    slug?: string
    isActive: boolean
  }
}

export type MasterAdminPayload = {
  tenantId: string
  name: string
  email: string
  password: string
}

export async function getMasterAdmins(): Promise<MasterAdmin[]> {
  const res = await apiFetch(`${API_BASE_URL}/master/admins`, {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao buscar admins')
  }

  return res.json()
}

export async function createMasterAdmin(
  payload: MasterAdminPayload
): Promise<MasterAdmin> {
  const res = await apiFetch(`${API_BASE_URL}/master/admins`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    throw await parseApiError(res, 'Erro ao criar admin')
  }

  return res.json()
}