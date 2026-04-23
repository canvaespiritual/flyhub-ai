import type { Prisma, UserRole } from '@prisma/client'

type SessionUser = {
  id: string
  tenantId: string
  role: UserRole
}

type ConversationWithAssignedUser = {
  id: string
  tenantId: string
  managerId?: string | null
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

function buildManagerScope(sessionUser: SessionUser): Prisma.ConversationWhereInput {
  return {
    tenantId: sessionUser.tenantId,
    managerId: sessionUser.id
  }
}

export function buildConversationAccessWhere(
  sessionUser: SessionUser,
  conversationId: string,
  options?: {
    allowAgentUnassigned?: boolean
  }
): Prisma.ConversationWhereInput {
  const allowAgentUnassigned = options?.allowAgentUnassigned ?? false

  if (sessionUser.role === 'MASTER' || sessionUser.role === 'ADMIN') {
    return {
      id: conversationId,
      tenantId: sessionUser.tenantId
    }
  }

  if (sessionUser.role === 'MANAGER') {
    return {
      id: conversationId,
      ...buildManagerScope(sessionUser)
    }
  }

  return {
    id: conversationId,
    tenantId: sessionUser.tenantId,
    ...(allowAgentUnassigned
      ? {
          OR: [{ assignedUserId: sessionUser.id }, { assignedUserId: null }]
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

  if (sessionUser.role === 'MASTER' || sessionUser.role === 'ADMIN') {
    return {
      tenantId: sessionUser.tenantId
    }
  }

  if (sessionUser.role === 'MANAGER') {
    return buildManagerScope(sessionUser)
  }

  return {
    tenantId: sessionUser.tenantId,
    ...(allowAgentUnassigned
      ? {
          OR: [{ assignedUserId: sessionUser.id }, { assignedUserId: null }]
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

  if (sessionUser.role === 'MASTER' || sessionUser.role === 'ADMIN') {
    return true
  }

  if (sessionUser.role === 'MANAGER') {
    return (
      conversation.tenantId === sessionUser.tenantId &&
      conversation.managerId === sessionUser.id
    )
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

  if (sessionUser.role === 'MASTER' || sessionUser.role === 'ADMIN') {
    return {
      ok: true,
      targetUserId: requestedUserId ?? null
    }
  }

  if (sessionUser.role === 'MANAGER') {
    if (
      conversation.tenantId !== sessionUser.tenantId ||
      conversation.managerId !== sessionUser.id
    ) {
      return {
        ok: false,
        status: 403,
        message: 'Manager cannot assign conversation outside own scope'
      }
    }

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