import type { Conversation } from '@flyhub/shared'

const now = new Date().toISOString()

export const conversationsMock: Conversation[] = [
  {
    id: 'c1',
    leadId: 'l1',
    channel: 'whatsapp',
    mode: 'ai',
    status: 'open',
    priority: 'normal',
    unreadCount: 2,
    updatedAt: now,
    messages: [
      {
        id: 'm1',
        conversationId: 'c1',
        senderType: 'lead',
        direction: 'inbound',
        type: 'text',
        content: 'Olá',
        status: 'read',
        createdAt: now
      },
      {
        id: 'm2',
        conversationId: 'c1',
        senderType: 'ai',
        direction: 'outbound',
        type: 'text',
        content: 'Perfeito. Me fala sua renda familiar bruta aproximada.',
        status: 'delivered',
        createdAt: now
      }
    ],
    lastMessage: {
      id: 'm2',
      conversationId: 'c1',
      senderType: 'ai',
      direction: 'outbound',
      type: 'text',
      content: 'Perfeito. Me fala sua renda familiar bruta aproximada.',
      status: 'delivered',
      createdAt: now
    }
  },
  {
    id: 'c2',
    leadId: 'l2',
    channel: 'whatsapp',
    mode: 'manual',
    status: 'open',
    priority: 'normal',
    unreadCount: 0,
    updatedAt: now,
    messages: [
      {
        id: 'm3',
        conversationId: 'c2',
        senderType: 'lead',
        direction: 'inbound',
        type: 'text',
        content: 'Esse apartamento aceita FGTS?',
        status: 'read',
        createdAt: now
      },
      {
        id: 'm4',
        conversationId: 'c2',
        senderType: 'agent',
        direction: 'outbound',
        type: 'text',
        content: 'Aceita sim. Me passa sua renda bruta familiar que eu simulo.',
        status: 'sent',
        createdAt: now
      }
    ],
    lastMessage: {
      id: 'm4',
      conversationId: 'c2',
      senderType: 'agent',
      direction: 'outbound',
      type: 'text',
      content: 'Aceita sim. Me passa sua renda bruta familiar que eu simulo.',
      status: 'sent',
      createdAt: now
    }
  }
]