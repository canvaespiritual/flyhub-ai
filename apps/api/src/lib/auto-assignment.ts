import { prisma } from './prisma.js'
import { getEligibleAssignableUsers } from './routing-policy.js'

type AutoAssignInput = {
  tenantId: string
  conversationId: string
  assignedByUserId?: string | null
  reason?: string
}

/**
 * 🔥 valida turno
 */
function isUserInShift(member: any, now: Date) {
  if (!member.shiftStartHour || !member.shiftEndHour || !member.shiftDays?.length) {
    return true
  }

  const day = now.getDay()
  const hour = now.getHours()

  if (!member.shiftDays.includes(day)) return false

  if (member.shiftStartHour <= member.shiftEndHour) {
    return hour >= member.shiftStartHour && hour < member.shiftEndHour
  }

  return hour >= member.shiftStartHour || hour < member.shiftEndHour
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
              { id: effectiveManagerId },
              { managerId: effectiveManagerId }
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

  let targetUser: { id: string; userId?: string } | null = null

  // ==============================
  // 🎯 DISTRIBUIÇÃO POR CAMPANHA
  // ==============================

  if (distributionRule && distributionRule.members.length > 0) {
    const now = new Date()

    const eligibleScopedUsers = getEligibleAssignableUsers(scopedUsers)

    const validMembers = distributionRule.members.filter((member) => {
      const user = eligibleScopedUsers.find((u) => u.id === member.userId)
      if (!user) return false

      return isUserInShift(member, now)
    })

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
            in: validMembers.map((m) => m.userId)
          }
        },
        _max: { assignedAt: true }
      })

      const map = new Map(
        lastAssignments.map((i) => [i.userId, i._max.assignedAt])
      )

      const sorted = [...validMembers].sort((a, b) => {
        const aLast = map.get(a.userId)
        const bLast = map.get(b.userId)

        if (!aLast && !bLast) return a.sortOrder - b.sortOrder
        if (!aLast) return -1
        if (!bLast) return 1

        return aLast.getTime() - bLast.getTime()
      })

      targetUser = {
        id: sorted[0].userId,
        userId: sorted[0].userId
      }
    }
  }

  // ==============================
  // 🔥 FALLBACK 1 (IGNORA TURNO)
  // ==============================

  if (!targetUser) {
    const eligibleUsers = getEligibleAssignableUsers(scopedUsers)

    if (eligibleUsers.length > 0) {
      targetUser = {
        id: eligibleUsers[0].id
      }
    }
  }

  // ==============================
  // 🔥 FALLBACK 2 (GLOBAL)
  // ==============================

  if (!targetUser) {
    const globalUsers = await prisma.user.findMany({
      where: {
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        role: true,
        isActive: true,
        presenceStatus: true
      }
    })

    const eligibleGlobal = getEligibleAssignableUsers(globalUsers)

    if (eligibleGlobal.length > 0) {
      targetUser = {
        id: eligibleGlobal[0].id
      }
    }
  }

  // ==============================
  // 🚨 ÚLTIMO CASO
  // ==============================

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
      select: { id: true }
    })

    if (activeAssignments.length > 0) {
      await tx.assignment.updateMany({
        where: {
          id: { in: activeAssignments.map((a) => a.id) }
        },
        data: {
          unassignedAt: now
        }
      })
    }

    const updated = await tx.conversation.update({
      where: { id: conversation.id },
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

    /**
     * 🚨 ALERTA SISTEMA
     */
    if (!distributionRule || !distributionRule.members.length) {
      await tx.message.create({
        data: {
  conversationId: conversation.id,
  direction: 'INBOUND',
  senderType: 'SYSTEM',
  type: 'TEXT',
  provider: 'INTERNAL',
          content:
            '⚠️ Lead sem campanha identificada ou sem distribuição configurada.'
        }
      })
    }

    return updated
  })

  return {
    conversation: updatedConversation,
    assignedUserId: targetUserId,
    skipped: false,
    reason: null
  }
}