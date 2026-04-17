import { prisma } from './prisma.js'
import { getEligibleAssignableUsers } from './routing-policy.js'

type AutoAssignInput = {
  tenantId: string
  conversationId: string
  assignedByUserId?: string | null
  reason?: string
}

export async function autoAssignConversation(input: AutoAssignInput) {
  const { tenantId, conversationId, assignedByUserId = null, reason } = input

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      tenantId
    },
    include: {
      assignedUser: true,
      phoneNumber: true
    }
  })

  if (!conversation) {
    throw new Error('Conversation not found')
  }

  if (conversation.assignedUserId) {
    return {
      conversation,
      assignedUserId: conversation.assignedUserId,
      skipped: true,
      reason: 'Conversation already assigned'
    }
  }

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tenantId: true,
      isActive: true,
      presenceStatus: true
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }]
  })

 const eligibleUsers = getEligibleAssignableUsers(users)

let targetUser = null

if (eligibleUsers.length > 0) {
  const lastAssignments = await prisma.assignment.groupBy({
    by: ['userId'],
    where: {
      userId: {
        in: eligibleUsers.map((u) => u.id)
      }
    },
    _max: {
      assignedAt: true
    }
  })

  const lastAssignmentMap = new Map(
    lastAssignments.map((a) => [a.userId, a._max.assignedAt])
  )

  const sortedUsers = [...eligibleUsers].sort((a, b) => {
    const aLast = lastAssignmentMap.get(a.id)
    const bLast = lastAssignmentMap.get(b.id)

    // quem nunca recebeu vem primeiro
    if (!aLast && !bLast) return 0
    if (!aLast) return -1
    if (!bLast) return 1

    return aLast.getTime() - bLast.getTime()
  })

  targetUser = sortedUsers[0] ?? null
}

  if (!targetUser) {
    return {
      conversation,
      assignedUserId: null,
      skipped: true,
      reason: 'No eligible users available'
    }
  }

  const now = new Date()

  const updatedConversation = await prisma.$transaction(async (tx) => {
    const activeAssignments = await tx.assignment.findMany({
      where: {
        conversationId: conversation.id,
        unassignedAt: null
      },
      select: {
        id: true
      }
    })

    if (activeAssignments.length > 0) {
      await tx.assignment.updateMany({
        where: {
          id: {
            in: activeAssignments.map((assignment) => assignment.id)
          }
        },
        data: {
          unassignedAt: now
        }
      })
    }

    const updated = await tx.conversation.update({
      where: {
        id: conversation.id
      },
      data: {
        assignedUserId: targetUser.id,
        assignedAt: now,
        waitingSince: null
      },
      include: {
        assignedUser: true,
        phoneNumber: true
      }
    })

    await tx.assignment.create({
      data: {
        conversationId: conversation.id,
        userId: targetUser.id,
        assignedByUserId,
        assignedAt: now,
        reason: reason ?? 'Auto assignment'
      }
    })

    return updated
  })

  return {
    conversation: updatedConversation,
    assignedUserId: targetUser.id,
    skipped: false,
    reason: null
  }
}