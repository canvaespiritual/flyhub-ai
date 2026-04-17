import type { Prisma, UserRole } from '@prisma/client'

type SessionUser = {
  id: string
  tenantId: string
  role: UserRole
}

type ConversationWithAssignedUser = {
  id: string
  tenantId: string
  assignedUserId: string | null
  assignedUser?: {
    id: string
    name: string
    email: string
    role: UserRole | null
  } | null
}

type ResolveAssignmentInput = {
  sessionUser: SessionUser
  conversation: ConversationWithAssignedUser
  requestedUserId?: string | null
}

type ResolveAssignmentResult =
  | {
      ok: true
      targetUserId: string | null
    }
  | {
      ok: false
      status: number
      message: string
    }

export function buildConversationAccessWhere(
  sessionUser: SessionUser,
  conversationId: string,
  options?: {
    allowAgentUnassigned?: boolean
  }
): Prisma.ConversationWhereInput {
  const allowAgentUnassigned = options?.allowAgentUnassigned ?? false

  if (sessionUser.role === 'MASTER' || sessionUser.role === 'ADMIN' || sessionUser.role === 'MANAGER') {
    return {
      id: conversationId,
      tenantId: sessionUser.tenantId
    }
  }

  return {
    id: conversationId,
    tenantId: sessionUser.tenantId,
    ...(allowAgentUnassigned
      ? {
          OR: [
            { assignedUserId: sessionUser.id },
            { assignedUserId: null }
          ]
        }
      : {
          assignedUserId: sessionUser.id
        })
  }
}

export function buildConversationListWhere(
  sessionUser: SessionUser,
  options?: {
    allowAgentUnassigned?: boolean
  }
): Prisma.ConversationWhereInput {
  const allowAgentUnassigned = options?.allowAgentUnassigned ?? false

  if (sessionUser.role === 'MASTER' || sessionUser.role === 'ADMIN' || sessionUser.role === 'MANAGER') {
    return {
      tenantId: sessionUser.tenantId
    }
  }

  return {
    tenantId: sessionUser.tenantId,
    ...(allowAgentUnassigned
      ? {
          OR: [
            { assignedUserId: sessionUser.id },
            { assignedUserId: null }
          ]
        }
      : {
          assignedUserId: sessionUser.id
        })
  }
}

export function canOperateConversation(
  sessionUser: SessionUser,
  conversation: ConversationWithAssignedUser,
  options?: {
    allowAgentUnassigned?: boolean
  }
) {
  const allowAgentUnassigned = options?.allowAgentUnassigned ?? false

  if (
    sessionUser.role === 'MASTER' ||
    sessionUser.role === 'ADMIN' ||
    sessionUser.role === 'MANAGER'
  ) {
    return true
  }

  if (conversation.assignedUserId === sessionUser.id) {
    return true
  }

  if (allowAgentUnassigned && conversation.assignedUserId === null) {
    return true
  }

  return false
}

export function canChangeConversationMode(
  sessionUser: SessionUser,
  conversation: ConversationWithAssignedUser,
  options?: {
    allowAgentUnassigned?: boolean
  }
) {
  return canOperateConversation(sessionUser, conversation, options)
}

export function resolveAssignmentTarget(
  input: ResolveAssignmentInput
): ResolveAssignmentResult {
  const { sessionUser, conversation, requestedUserId } = input

  if (
    sessionUser.role === 'MASTER' ||
    sessionUser.role === 'ADMIN' ||
    sessionUser.role === 'MANAGER'
  ) {
    return {
      ok: true,
      targetUserId: requestedUserId ?? null
    }
  }

  if (sessionUser.role === 'AGENT') {
    if (requestedUserId && requestedUserId !== sessionUser.id) {
      return {
        ok: false,
        status: 403,
        message: 'Agent cannot assign conversation to another user'
      }
    }

    if (
      conversation.assignedUserId &&
      conversation.assignedUserId !== sessionUser.id
    ) {
      return {
        ok: false,
        status: 403,
        message: 'Conversation is assigned to another user'
      }
    }

    return {
      ok: true,
      targetUserId: sessionUser.id
    }
  }

  return {
    ok: false,
    status: 403,
    message: 'User role not allowed to assign conversation'
  }
}
