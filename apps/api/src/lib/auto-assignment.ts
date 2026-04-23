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
      phoneNumber: true,
      campaign: {
        select: {
          id: true,
          managerId: true
        }
      }
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

  const effectiveManagerId =
    conversation.managerId ?? conversation.campaign?.managerId ?? null

  const distributionRule = conversation.campaignId
    ? await prisma.campaignDistributionRule.findFirst({
        where: {
          campaignId: conversation.campaignId,
          isActive: true
        },
        include: {
          members: {
            where: {
              isActive: true
            },
            orderBy: {
              sortOrder: 'asc'
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  tenantId: true,
                  isActive: true,
                  presenceStatus: true,
                  managerId: true
                }
              }
            }
          }
        }
      })
    : null

  const scopedUsers = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(effectiveManagerId
        ? {
            OR: [
              {
                id: effectiveManagerId
              },
              {
                managerId: effectiveManagerId
              }
            ]
          }
        : {})
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tenantId: true,
      isActive: true,
      presenceStatus: true,
      managerId: true
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }]
  })

  let targetUser: {
    id: string
    userId?: string
  } | null = null

  if (distributionRule && distributionRule.members.length > 0) {
    const eligibleScopedUsers = getEligibleAssignableUsers(scopedUsers)

    const validMembers = distributionRule.members.filter((member) =>
      eligibleScopedUsers.some((user) => user.id === member.userId)
    )

    if (distributionRule.mode === 'MANUAL_ONLY') {
      return {
        conversation,
        assignedUserId: null,
        skipped: true,
        reason: 'Manual distribution only'
      }
    }

    if (distributionRule.mode === 'ORDERED_QUEUE' && validMembers.length > 0) {
      targetUser = {
        id: validMembers[0].userId,
        userId: validMembers[0].userId
      }
    }

    if (distributionRule.mode === 'ROUND_ROBIN' && validMembers.length > 0) {
      const lastAssignments = await prisma.assignment.groupBy({
        by: ['userId'],
        where: {
          userId: {
            in: validMembers.map((member) => member.userId)
          }
        },
        _max: {
          assignedAt: true
        }
      })

      const lastAssignmentMap = new Map(
        lastAssignments.map((item) => [item.userId, item._max.assignedAt])
      )

      const sortedMembers = [...validMembers].sort((a, b) => {
        const aLast = lastAssignmentMap.get(a.userId)
        const bLast = lastAssignmentMap.get(b.userId)

        if (!aLast && !bLast) {
          return a.sortOrder - b.sortOrder
        }

        if (!aLast) return -1
        if (!bLast) return 1

        return aLast.getTime() - bLast.getTime()
      })

      targetUser = {
        id: sortedMembers[0].userId,
        userId: sortedMembers[0].userId
      }
    }
  }

  if (!targetUser) {
    const eligibleUsers = getEligibleAssignableUsers(scopedUsers)

    if (eligibleUsers.length > 0) {
      const lastAssignments = await prisma.assignment.groupBy({
        by: ['userId'],
        where: {
          userId: {
            in: eligibleUsers.map((user) => user.id)
          }
        },
        _max: {
          assignedAt: true
        }
      })

      const lastAssignmentMap = new Map(
        lastAssignments.map((item) => [item.userId, item._max.assignedAt])
      )

      const sortedUsers = [...eligibleUsers].sort((a, b) => {
        const aLast = lastAssignmentMap.get(a.id)
        const bLast = lastAssignmentMap.get(b.id)

        if (!aLast && !bLast) return 0
        if (!aLast) return -1
        if (!bLast) return 1

        return aLast.getTime() - bLast.getTime()
      })

      targetUser = {
        id: sortedUsers[0].id
      }
    }
  }

  if (!targetUser) {
    return {
      conversation,
      assignedUserId: null,
      skipped: true,
      reason: 'No eligible users available'
    }
  }

  const targetUserId = targetUser.userId ?? targetUser.id
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
        assignedUserId: targetUserId,
        assignedAt: now,
        waitingSince: null,
        ...(conversation.managerId
          ? {}
          : effectiveManagerId
            ? { managerId: effectiveManagerId }
            : {})
      },
      include: {
        assignedUser: true,
        phoneNumber: true
      }
    })

    await tx.assignment.create({
      data: {
        conversationId: conversation.id,
        userId: targetUserId,
        assignedByUserId,
        assignedAt: now,
        reason: reason ?? 'Auto assignment'
      }
    })

    return updated
  })

  return {
    conversation: updatedConversation,
    assignedUserId: targetUserId,
    skipped: false,
    reason: null
  }
}