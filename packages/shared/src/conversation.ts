import type { ChannelType, Message, UserRole } from './chat'

export type ConversationMode = 'manual' | 'ai'

export type ConversationStatus = 'open' | 'pending' | 'closed'

export type ConversationPriority = 'low' | 'normal' | 'high'

export interface ConversationAssignedUser {
  id: string
  name: string
  email: string
  role?: UserRole
}

export interface ConversationPhoneNumber {
  id: string
  number: string
  label?: string
}

export interface Conversation {
  id: string
  leadId: string
  channel: ChannelType
  mode: ConversationMode
  status: ConversationStatus
  priority: ConversationPriority

  messages: Message[]
  lastMessage?: Message
  unreadCount: number

  subject?: string
  metaThreadId?: string
  campaignId?: string
  managerId?: string

  updatedAt: string
  assignedAt?: string
  waitingSince?: string
  firstResponseAt?: string
  closedAt?: string

  assignedUser?: ConversationAssignedUser | null
  phoneNumber?: ConversationPhoneNumber
}