import { prisma } from '../prisma.js'
import { sendWhatsAppTextMessage } from '../whatsapp.js'
import { publish } from '../realtime.js'
import { applyMessageIdentityPrefix } from '../message-identity.js'

const FOLLOWUP_START_HOUR = 6
const FOLLOWUP_END_HOUR = 23

const FOLLOWUP_DELAYS = [
  1,
  2,
  3
]

function isInsideQuietHours(date: Date) {
  const hour = date.getHours()

  return hour >= FOLLOWUP_END_HOUR || hour < FOLLOWUP_START_HOUR
}

function moveToNextAllowedWindow(date: Date) {
  const adjusted = new Date(date)

  if (adjusted.getHours() >= FOLLOWUP_END_HOUR) {
    adjusted.setDate(adjusted.getDate() + 1)
  }

  adjusted.setHours(FOLLOWUP_START_HOUR, 10, 0, 0)

  return adjusted
}

function applyFollowupWindow(date: Date) {
  if (!isInsideQuietHours(date)) {
    return date
  }

  return moveToNextAllowedWindow(date)
}

export function calculateNextFollowupAt(params: {
  baseDate: Date
  followupCount: number
}) {
  const delayMinutes =
    FOLLOWUP_DELAYS[params.followupCount]

  if (delayMinutes === undefined) {
    return null
  }

  const nextDate = new Date(
    params.baseDate.getTime() + delayMinutes * 60 * 1000
  )

  return applyFollowupWindow(nextDate)
}

export async function resetConversationFollowups(
  conversationId: string
) {
  await prisma.$transaction([
    prisma.conversationAiState.updateMany({
      where: {
        conversationId
      },
      data: {
        followupCount: 0,
        lastFollowupAt: null,
        lastFollowupBaseMessageId: null,
        followupPaused: false
      }
    }),

    prisma.conversation.update({
      where: {
        id: conversationId
      },
      data: {
        nextFollowupAt: null
      }
    })
  ])
}

export async function scheduleNextConversationFollowup(params: {
  conversationId: string
  baseMessageId: string
  baseDate: Date
}) {
  const state = await prisma.conversationAiState.findUnique({
    where: {
      conversationId: params.conversationId
    }
  })

  if (!state || state.followupPaused) {
    return null
  }

  const nextFollowupAt = calculateNextFollowupAt({
    baseDate: params.baseDate,
    followupCount: state.followupCount
  })

  if (!nextFollowupAt) {
    return null
  }

  await prisma.conversation.update({
    where: {
      id: params.conversationId
    },
    data: {
      nextFollowupAt
    }
  })

  await prisma.conversationAiState.update({
    where: {
      conversationId: params.conversationId
    },
    data: {
      lastFollowupBaseMessageId: params.baseMessageId
    }
  })

  return nextFollowupAt
}


export async function processPendingAiFollowups() {
  const now = new Date()

  const conversations = await prisma.conversation.findMany({
    where: {
      mode: 'AI',
      status: 'OPEN',
      nextFollowupAt: {
        lte: now
      }
    },
    include: {
      contact: true,
      phoneNumber: {
        include: {
          whatsappConnection: true
        }
      },
      campaign: true,
      aiState: {
        include: {
          agent: {
            include: {
              followupRules: {
                where: {
                  isActive: true
                },
                orderBy: {
                  delayMinutes: 'asc'
                }
              }
            }
          }
        }
      }
    },
    take: 20
  })

  for (const conversation of conversations) {
    try {
      if (!conversation.aiState) continue
      if (conversation.aiState.followupPaused) continue
      if (conversation.aiState.followupCount >= 3) continue

      const claimed = await prisma.conversation.updateMany({
        where: {
          id: conversation.id,
          mode: 'AI',
          status: 'OPEN',
          nextFollowupAt: {
            lte: now
          }
        },
        data: {
          nextFollowupAt: null
        }
      })

      if (claimed.count === 0) {
        continue
      }

      const lastInbound = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          senderType: 'LEAD'
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      if (!lastInbound) continue

      const windowExpiresAt = new Date(
        lastInbound.createdAt.getTime() + 24 * 60 * 60 * 1000
      )

      if (windowExpiresAt <= now) {
        continue
      }

      const lastOutbound = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          direction: 'OUTBOUND'
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      if (!lastOutbound) continue

      const leadRepliedAfterLastOutbound = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          senderType: 'LEAD',
          createdAt: {
            gt: lastOutbound.createdAt
          }
        },
        select: {
          id: true
        }
      })

      if (leadRepliedAfterLastOutbound) {
        await resetConversationFollowups(conversation.id)
        continue
      }

      const followupRule =
        conversation.aiState.agent.followupRules[
          conversation.aiState.followupCount
        ]

      const fallbackTexts = [
        'Só passando aqui para continuar seu atendimento 😊',
        'Conseguiu ver nossa última mensagem?',
        'Se ainda fizer sentido para você, posso continuar daqui.'
      ]

      const rawText =
        followupRule?.message?.trim() ||
        fallbackTexts[conversation.aiState.followupCount]

      if (!rawText) continue

      if (!conversation.phoneNumber.externalId) continue
      if (!conversation.contact.phone) continue

      const whatsappText = applyMessageIdentityPrefix({
        text: rawText,
        campaign: conversation.campaign,
        sender: {
          senderType: 'AI'
        }
      })

      const response = await sendWhatsAppTextMessage({
        phoneNumberId: conversation.phoneNumber.externalId,
        to: conversation.contact.phone,
        text: whatsappText,
        accessToken:
          conversation.phoneNumber.whatsappConnection?.accessToken ?? null
      })

      const sentAt = new Date()

      const createdMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'AI',
          direction: 'OUTBOUND',
          type: 'TEXT',
          status: 'SENT',
          provider: conversation.phoneNumber.provider,
          content: rawText,
          externalMessageId: response.messages?.[0]?.id ?? null,
          externalStatus: 'sent',
          sentAt
        }
      })

      const nextFollowupAt = calculateNextFollowupAt({
        baseDate: sentAt,
        followupCount: conversation.aiState.followupCount + 1
      })

      await prisma.$transaction([
        prisma.conversationAiState.update({
          where: {
            conversationId: conversation.id
          },
          data: {
            followupCount: {
              increment: 1
            },
            lastFollowupAt: sentAt,
            lastFollowupBaseMessageId: createdMessage.id
          }
        }),

        prisma.conversation.update({
          where: {
            id: conversation.id
          },
          data: {
            lastMessageAt: sentAt,
            lastOutboundAt: sentAt,
            nextFollowupAt,
            updatedAt: sentAt
          }
        })
      ])

      publish(conversation.tenantId, {
        type: 'message:new',
        payload: {
          id: createdMessage.id,
          conversationId: createdMessage.conversationId,
          senderType: createdMessage.senderType.toLowerCase(),
          direction: createdMessage.direction.toLowerCase(),
          type: createdMessage.type.toLowerCase(),
          content: createdMessage.content ?? '',
          status: createdMessage.status.toLowerCase(),
          createdAt: createdMessage.createdAt.toISOString()
        }
      })
    } catch (error) {
      console.error('[AI_FOLLOWUP_PROCESS_ERROR]', {
        conversationId: conversation.id,
        error
      })
    }
  }
}