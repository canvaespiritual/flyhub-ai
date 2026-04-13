import type { Conversation } from '@flyhub/shared'
import { getMessagePreview } from './message-utils'

export function getConversationPreview(conversation: Conversation): string {
  return getMessagePreview(conversation.lastMessage)
}

export function getConversationDisplayName(conversation: Conversation): string {
  return conversation.leadId
}

export function sortConversationsByUpdatedAt(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}