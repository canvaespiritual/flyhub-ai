export type MessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'location'

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed'

export type MessageDirection = 'inbound' | 'outbound'

export type SenderType = 'lead' | 'agent' | 'ai' | 'system'

export type ChannelType = 'whatsapp' | 'instagram' | 'facebook' | 'webchat'

export type UserRole = 'master' | 'admin' | 'manager' | 'agent'

export interface MessageSenderUser {
  id: string
  name: string
  email: string
  role?: UserRole
}

export interface Message {
  id: string
  conversationId: string

  senderType: SenderType
  direction: MessageDirection

  type: MessageType
  content?: string

  mediaUrl?: string
  mimeType?: string
  fileName?: string
  durationSeconds?: number
    latitude?: number
  longitude?: number
  locationName?: string
  locationAddress?: string

  status: MessageStatus
  createdAt: string

  senderUser?: MessageSenderUser | null
}