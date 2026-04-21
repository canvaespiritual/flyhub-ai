import { prisma } from './prisma.js'
import {
  sendWhatsAppMediaMessage,
  sendWhatsAppTextMessage,
  uploadWhatsAppMedia
} from './whatsapp.js'
import { publish } from './realtime.js'

type AutomationStepType =
  | 'TEXT'
  | 'AUDIO'
  | 'IMAGE'
  | 'DOCUMENT'
  | 'VIDEO'
  | 'LINK'

type StartInitialSequenceParams = {
  conversationId: string
}

type CancelConversationAutomationParams = {
  conversationId: string
  reason?: string
}



const AUTOMATION_WAKE_UP_GRACE_MS = 1500

function mapConversationMode(mode: 'MANUAL' | 'AI') {
  return mode === 'AI' ? 'ai' : 'manual'
}

function mapConversationStatus(status: 'OPEN' | 'PENDING' | 'CLOSED') {
  if (status === 'PENDING') return 'pending'
  if (status === 'CLOSED') return 'closed'
  return 'open'
}

function mapConversationPriority(priority: 'LOW' | 'NORMAL' | 'HIGH') {
  if (priority === 'LOW') return 'low'
  if (priority === 'HIGH') return 'high'
  return 'normal'
}

function mapAssignedUser(
  user:
    | {
        id: string
        name: string
        email: string
        role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
      }
    | null
    | undefined
) {
  if (!user) return null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.toLowerCase()
  }
}

function mapPhoneNumber(phoneNumber: {
  id: string
  number: string
  label: string | null
}) {
  return {
    id: phoneNumber.id,
    number: phoneNumber.number,
    label: phoneNumber.label ?? undefined
  }
}

function buildConversationRealtimePayload(conversation: {
  id: string
  mode: 'MANUAL' | 'AI'
  status: 'OPEN' | 'PENDING' | 'CLOSED'
  priority: 'LOW' | 'NORMAL' | 'HIGH'
  updatedAt: Date
  assignedAt: Date | null
  waitingSince: Date | null
  firstResponseAt: Date | null
  closedAt: Date | null
  subject: string | null
  metaThreadId: string | null
  campaignId: string | null
  managerId: string | null
  assignedUser: {
    id: string
    name: string
    email: string
    role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
  } | null
  phoneNumber: {
    id: string
    number: string
    label: string | null
  }
}) {
  return {
    id: conversation.id,
    mode: mapConversationMode(conversation.mode),
    status: mapConversationStatus(conversation.status),
    priority: mapConversationPriority(conversation.priority),
    updatedAt: conversation.updatedAt.toISOString(),
    assignedAt: conversation.assignedAt?.toISOString(),
    waitingSince: conversation.waitingSince?.toISOString(),
    firstResponseAt: conversation.firstResponseAt?.toISOString(),
    closedAt: conversation.closedAt?.toISOString(),
    subject: conversation.subject ?? undefined,
    metaThreadId: conversation.metaThreadId ?? undefined,
    campaignId: conversation.campaignId ?? undefined,
    managerId: conversation.managerId ?? undefined,
    assignedUser: mapAssignedUser(conversation.assignedUser),
    phoneNumber: mapPhoneNumber(conversation.phoneNumber)
  }
}

function buildRealtimeMessagePayload(message: {
  id: string
  conversationId: string
  senderType: 'LEAD' | 'AGENT' | 'AI' | 'SYSTEM'
  direction: 'INBOUND' | 'OUTBOUND'
  type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION'
  content: string | null
  mediaUrl: string | null
  mimeType: string | null
  fileName: string | null
  durationSeconds: number | null
  latitude: number | null
  longitude: number | null
  locationName: string | null
  locationAddress: string | null
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  createdAt: Date
}) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderType: message.senderType.toLowerCase(),
    direction: message.direction.toLowerCase(),
    type: message.type.toLowerCase(),
    content: message.content ?? '',
    mediaUrl: message.mediaUrl ?? undefined,
    mimeType: message.mimeType ?? undefined,
    fileName: message.fileName ?? undefined,
    durationSeconds: message.durationSeconds ?? undefined,
    latitude: message.latitude ?? undefined,
    longitude: message.longitude ?? undefined,
    locationName: message.locationName ?? undefined,
    locationAddress: message.locationAddress ?? undefined,
    status: message.status.toLowerCase(),
    createdAt: message.createdAt.toISOString()
  }
}

function addSeconds(baseDate: Date, seconds: number) {
  return new Date(baseDate.getTime() + seconds * 1000)
}

function normalizeStepContentForSend(
  type: AutomationStepType,
  content?: string | null
) {
  const safeContent = content?.trim() ?? ''

  if (type === 'LINK') {
    return safeContent
  }

  return safeContent
}

function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function sanitizeName(name?: string | null): string | null {
  if (!name) return null

  const cleaned = name
    .trim()
    .split(' ')[0]
    .replace(/[^a-zA-ZÀ-ÿ]/g, '')

  if (!cleaned) return null

  if (cleaned.length < 2) return null
  if (cleaned.length > 20) return null

  const blacklist = [
    'deus',
    'jesus',
    'cristo',
    'filha',
    'filho',
    'amor',
    'linda',
    'gostosa',
    'rainha'
  ]

  if (blacklist.includes(cleaned.toLowerCase())) return null

  return cleaned
}

function buildNameSuffix(name?: string | null): string {
  const validName = sanitizeName(name)
  return validName ? `, ${validName}` : ''
}
function applyPlaceholders(
  text: string,
  contactName?: string | null
): string {
  const greeting = getGreeting()
  const nameSuffix = buildNameSuffix(contactName)

  return text
    .replace(/\{greeting\}/gi, greeting)
    .replace(/\{nameSuffix\}/gi, nameSuffix)
}
function getAutomationMessageType(
  stepType: AutomationStepType
): 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' {
  switch (stepType) {
    case 'AUDIO':
      return 'AUDIO'
    case 'IMAGE':
      return 'IMAGE'
    case 'DOCUMENT':
      return 'DOCUMENT'
    case 'VIDEO':
      return 'VIDEO'
    case 'TEXT':
    case 'LINK':
    default:
      return 'TEXT'
  }
}

function getWhatsAppMediaType(
  stepType: AutomationStepType
): 'audio' | 'image' | 'document' | 'video' | null {
  switch (stepType) {
    case 'AUDIO':
      return 'audio'
    case 'IMAGE':
      return 'image'
    case 'DOCUMENT':
      return 'document'
    case 'VIDEO':
      return 'video'
    default:
      return null
  }
}

function shouldUseCaption(stepType: AutomationStepType) {
  return stepType === 'IMAGE' || stepType === 'DOCUMENT' || stepType === 'VIDEO'
}

async function downloadAutomationMedia(mediaUrl: string) {
  const response = await fetch(mediaUrl)

  if (!response.ok) {
    throw new Error(`Failed to download automation media: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function normalizeNullableAutomationText(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function scheduleConversationWakeUp(conversationId: string, targetDate: Date | null) {
  if (!targetDate) return

  const delayMs = Math.max(targetDate.getTime() - Date.now(), 0)

  setTimeout(() => {
    void runConversationAutomation({ conversationId }).catch((error) => {
      console.error('[AUTOMATION_RUN_ERROR]', {
        conversationId,
        error
      })
    })
  }, delayMs + AUTOMATION_WAKE_UP_GRACE_MS)
}

export async function cancelConversationAutomation(
  params: CancelConversationAutomationParams
) {
  const now = new Date()

  const updatedConversation = await prisma.conversation.update({
    where: {
      id: params.conversationId
    },
    data: {
      automationStatus: 'CANCELLED',
      automationCancelledAt: now,
      nextAutomationAt: null,
      automationVersion: {
        increment: 1
      }
    },
    include: {
      assignedUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      phoneNumber: {
        select: {
          id: true,
          number: true,
          label: true
        }
      }
    }
  })

  publish(updatedConversation.tenantId, {
    type: 'conversation:mode_changed',
    payload: buildConversationRealtimePayload(updatedConversation)
  })

  console.log('[AUTOMATION_CANCELLED]', {
    conversationId: params.conversationId,
    reason: params.reason ?? 'manual_cancel'
  })
}

export async function startInitialSequenceForConversation(
  params: StartInitialSequenceParams
) {
  const now = new Date()

  const conversation = await prisma.conversation.findUnique({
    where: {
      id: params.conversationId
    },
    include: {
      campaign: {
        include: {
          initialSteps: {
            where: {
              isActive: true
            },
            orderBy: {
              order: 'asc'
            }
          }
        }
      },
      phoneNumber: true,
      contact: true
    }
  })

  if (!conversation) {
    console.warn('[AUTOMATION_START_SKIPPED_CONVERSATION_NOT_FOUND]', {
      conversationId: params.conversationId
    })
    return
  }

  if (!conversation.campaignId || !conversation.campaign) {
    console.log('[AUTOMATION_START_SKIPPED_NO_CAMPAIGN]', {
      conversationId: params.conversationId
    })
    return
  }

  if (!conversation.campaign.initialSteps.length) {
    console.log('[AUTOMATION_START_SKIPPED_NO_STEPS]', {
      conversationId: params.conversationId,
      campaignId: conversation.campaignId
    })
    return
  }

  if (conversation.automationStatus === 'RUNNING') {
    console.log('[AUTOMATION_START_SKIPPED_ALREADY_RUNNING]', {
      conversationId: params.conversationId
    })
    return
  }

  const firstStep = conversation.campaign.initialSteps[0]
  const nextAutomationAt = addSeconds(now, firstStep.delaySeconds)

  await prisma.conversation.update({
  where: {
    id: conversation.id
  },
  data: {
    automationKind: 'INITIAL_SEQUENCE',
    automationStatus: 'RUNNING',
    currentAutomationStepOrder: null,
    automationStartedAt: now,
    automationCompletedAt: null,
    automationCancelledAt: null,
    lastAutomationDispatchAt: null,
    nextAutomationAt,
    mode: 'AI'
  }
})

  console.log('[AUTOMATION_STARTED]', {
    conversationId: conversation.id,
    campaignId: conversation.campaignId,
    firstStepOrder: firstStep.order,
    nextAutomationAt: nextAutomationAt.toISOString()
  })

  scheduleConversationWakeUp(conversation.id, nextAutomationAt)
}

export async function runConversationAutomation(params: {
  conversationId: string
}) {
  const now = new Date()

  const conversation = await prisma.conversation.findUnique({
    where: {
      id: params.conversationId
    },
    include: {
      contact: true,
      phoneNumber: true,
      assignedUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      },
      campaign: {
        include: {
          initialSteps: {
            where: {
              isActive: true
            },
            orderBy: {
              order: 'asc'
            }
          }
        }
      }
    }
  })

  if (!conversation) {
    console.warn('[AUTOMATION_RUN_SKIPPED_CONVERSATION_NOT_FOUND]', {
      conversationId: params.conversationId
    })
    return
  }

  if (conversation.automationStatus !== 'RUNNING') {
    console.log('[AUTOMATION_RUN_SKIPPED_STATUS]', {
      conversationId: conversation.id,
      automationStatus: conversation.automationStatus
    })
    return
  }

  if (conversation.mode === 'MANUAL') {
  await cancelConversationAutomation({
    conversationId: conversation.id,
    reason: 'conversation_switched_to_manual'
  })
  return
}

  if (conversation.status === 'CLOSED') {
    await cancelConversationAutomation({
      conversationId: conversation.id,
      reason: 'conversation_closed'
    })
    return
  }

  
  if (!conversation.nextAutomationAt || conversation.nextAutomationAt.getTime() > now.getTime()) {
    console.log('[AUTOMATION_RUN_SKIPPED_NOT_DUE_YET]', {
      conversationId: conversation.id,
      nextAutomationAt: conversation.nextAutomationAt?.toISOString()
    })
    return
  }

  if (conversation.automationKind !== 'INITIAL_SEQUENCE') {
    console.log('[AUTOMATION_RUN_SKIPPED_KIND]', {
      conversationId: conversation.id,
      automationKind: conversation.automationKind
    })
    return
  }

  if (!conversation.campaign || !conversation.campaign.initialSteps.length) {
    await cancelConversationAutomation({
      conversationId: conversation.id,
      reason: 'campaign_or_steps_missing'
    })
    return
  }

  if (!conversation.phoneNumber.externalId) {
    await cancelConversationAutomation({
      conversationId: conversation.id,
      reason: 'phone_number_missing_external_id'
    })
    return
  }

  if (!conversation.contact.phone) {
    await cancelConversationAutomation({
      conversationId: conversation.id,
      reason: 'contact_phone_missing'
    })
    return
  }

  const currentOrder = conversation.currentAutomationStepOrder ?? null

  const nextStep = conversation.campaign.initialSteps.find((step) => {
    if (currentOrder == null) return true
    return step.order > currentOrder
  })

  if (!nextStep) {
    const completedConversation = await prisma.conversation.update({
      where: {
        id: conversation.id
      },
      data: {
        automationStatus: 'COMPLETED',
        automationCompletedAt: now,
        nextAutomationAt: null,
        mode: 'AI'
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        phoneNumber: {
          select: {
            id: true,
            number: true,
            label: true
          }
        }
      }
    })

    publish(completedConversation.tenantId, {
      type: 'conversation:mode_changed',
      payload: buildConversationRealtimePayload(completedConversation)
    })

    console.log('[AUTOMATION_COMPLETED]', {
      conversationId: conversation.id
    })

    return
  }

  let normalizedContent = normalizeStepContentForSend(
  nextStep.type,
  nextStep.content
)

if (nextStep.type === 'TEXT' || nextStep.type === 'LINK') {
  normalizedContent = applyPlaceholders(
    normalizedContent,
    conversation.contact?.name
  )
}

    let externalMessageId: string | null = null
  let externalMediaId: string | null = null
  let messageType: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' = 'TEXT'
  let contentForMessage = normalizedContent
  let externalStatus = 'sent'
  let mediaUrlForMessage: string | null = null
  let mimeTypeForMessage: string | null = null
  let fileNameForMessage: string | null = null
  let storageKeyForMessage: string | null = null

  if (nextStep.type === 'TEXT' || nextStep.type === 'LINK') {
    const waResponse = await sendWhatsAppTextMessage({
      phoneNumberId: conversation.phoneNumber.externalId,
      to: conversation.contact.phone,
      text: normalizedContent
    })

    externalMessageId = waResponse.messages?.[0]?.id ?? null
    messageType = 'TEXT'
  } else {
    const mediaStepType = getWhatsAppMediaType(nextStep.type)

    if (!mediaStepType) {
      throw new Error(`Unsupported automation media step type: ${nextStep.type}`)
    }

    // Compatibilidade com o formato antigo:
    // se não houver mediaUrl, assume que content ainda é um mediaId pronto
    if (!nextStep.mediaUrl) {
            const waResponse = await sendWhatsAppMediaMessage({
        phoneNumberId: conversation.phoneNumber.externalId,
        to: conversation.contact.phone,
        type: mediaStepType,
        mediaId: normalizedContent
      })

      externalMessageId = waResponse.messages?.[0]?.id ?? null
      messageType = getAutomationMessageType(nextStep.type)
      contentForMessage = ''
    } else {
      const mediaBuffer = await downloadAutomationMedia(nextStep.mediaUrl)

      const uploadedMedia = await uploadWhatsAppMedia({
        phoneNumberId: conversation.phoneNumber.externalId,
        fileBuffer: mediaBuffer,
        mimeType:
          nextStep.mimeType ||
          (mediaStepType === 'audio'
            ? 'audio/ogg'
            : mediaStepType === 'image'
              ? 'image/jpeg'
              : mediaStepType === 'video'
                ? 'video/mp4'
                : 'application/octet-stream'),
        fileName:
          nextStep.fileName ||
          `${mediaStepType}-${Date.now()}${
            mediaStepType === 'audio'
              ? '.ogg'
              : mediaStepType === 'image'
                ? '.jpg'
                : mediaStepType === 'video'
                  ? '.mp4'
                  : ''
          }`
      })

      externalMediaId = uploadedMedia.id

            const captionText = shouldUseCaption(nextStep.type)
        ? normalizeNullableAutomationText(nextStep.content) ?? undefined
        : undefined

      const waResponse = await sendWhatsAppMediaMessage({
        phoneNumberId: conversation.phoneNumber.externalId,
        to: conversation.contact.phone,
        type: mediaStepType,
        mediaId: uploadedMedia.id,
        caption: captionText,
        fileName:
          mediaStepType === 'document'
            ? nextStep.fileName ?? undefined
            : undefined
      })

      externalMessageId = waResponse.messages?.[0]?.id ?? null
      messageType = getAutomationMessageType(nextStep.type)
      contentForMessage = shouldUseCaption(nextStep.type)
        ? normalizeNullableAutomationText(nextStep.content) ?? ''
        : ''
      mediaUrlForMessage = nextStep.mediaUrl ?? null
      mimeTypeForMessage = nextStep.mimeType ?? null
      fileNameForMessage = nextStep.fileName ?? null
      storageKeyForMessage = nextStep.storageKey ?? null
    }
  }
  if (!externalMessageId) {
    throw new Error(
      `Automation step send did not return externalMessageId for conversation ${conversation.id}`
    )
  }

  const currentStepIndex = conversation.campaign.initialSteps.findIndex(
    (step) => step.id === nextStep.id
  )

  const followingStep =
    currentStepIndex >= 0
      ? conversation.campaign.initialSteps[currentStepIndex + 1] ?? null
      : null

  const followingAutomationAt = followingStep
    ? addSeconds(now, followingStep.delaySeconds)
    : null

  const result = await prisma.$transaction(async (tx) => {
          const createdMessage = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'SYSTEM',
          direction: 'OUTBOUND',
          type: messageType,
          status: 'SENT',
          provider: conversation.phoneNumber.provider,
          content: contentForMessage,
          mediaUrl: mediaUrlForMessage,
          storageKey: storageKeyForMessage,
          mimeType: mimeTypeForMessage,
          fileName: fileNameForMessage,
          externalMediaId,
          externalMessageId,
          externalStatus,
          sentAt: now
        }
      })

    const updatedConversation = await tx.conversation.update({
      where: {
        id: conversation.id
      },
      data: {
        lastMessageAt: now,
        lastOutboundAt: now,
        currentAutomationStepOrder: nextStep.order,
        lastAutomationDispatchAt: now,
        nextAutomationAt: followingAutomationAt
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        phoneNumber: {
          select: {
            id: true,
            number: true,
            label: true
          }
        }
      }
    })

    return {
      createdMessage,
      updatedConversation
    }
  })

  publish(conversation.tenantId, {
    type: 'message:new',
    payload: buildRealtimeMessagePayload(result.createdMessage)
  })

  publish(conversation.tenantId, {
    type: 'conversation:mode_changed',
    payload: buildConversationRealtimePayload(result.updatedConversation)
  })

  console.log('[AUTOMATION_STEP_SENT]', {
    conversationId: conversation.id,
    stepOrder: nextStep.order,
    stepType: nextStep.type,
    nextAutomationAt: followingAutomationAt?.toISOString() ?? null
  })

  if (followingAutomationAt) {
    scheduleConversationWakeUp(conversation.id, followingAutomationAt)
    return
  }

  await runConversationAutomation({
    conversationId: conversation.id
  })
}