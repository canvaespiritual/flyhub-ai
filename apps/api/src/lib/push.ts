import webPush from 'web-push'
import { prisma } from './prisma.js'

const publicKey = process.env.VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject = process.env.VAPID_SUBJECT || 'mailto:contato@flyhub.ai'

if (publicKey && privateKey) {
  webPush.setVapidDetails(subject, publicKey, privateKey)
}

export function getVapidPublicKey() {
  if (!publicKey) {
    throw new Error('VAPID_PUBLIC_KEY not configured')
  }

  return publicKey
}

export function isPushConfigured() {
  return Boolean(publicKey && privateKey)
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  conversationId?: string
}

export async function sendPushNotification(params: {
  subscriptionId: string
  endpoint: string
  p256dh: string
  auth: string
  payload: PushPayload
}) {
  if (!isPushConfigured()) {
    console.warn('[PUSH_SKIPPED] VAPID keys not configured')
    return
  }

  try {
    await webPush.sendNotification(
      {
        endpoint: params.endpoint,
        keys: {
          p256dh: params.p256dh,
          auth: params.auth
        }
      },
      JSON.stringify(params.payload)
    )
  } catch (error: any) {
    const statusCode = error?.statusCode

    console.error('[PUSH_SEND_ERROR]', {
      subscriptionId: params.subscriptionId,
      statusCode,
      message: error?.message
    })

    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription.updateMany({
        where: {
          id: params.subscriptionId
        },
        data: {
          enabled: false
        }
      })
    }
  }
}

function getPushPreview(content?: string | null) {
  const text = content?.trim()

  if (!text) return 'Nova mensagem recebida'

  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}

export async function notifyInboundMessagePush(params: {
  tenantId: string
  conversationId: string
  messageId: string
  content?: string | null
}) {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: params.conversationId
    },
    include: {
      contact: true,
      assignedUser: true
    }
  })

  if (!conversation) return

  let userIds: string[] = []

  if (conversation.assignedUserId) {
    userIds = [conversation.assignedUserId]
  } else {
    const supervisors = await prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        isActive: true,
        role: {
          in: ['ADMIN', 'MANAGER', 'MASTER']
        }
      },
      select: {
        id: true
      }
    })

    userIds = supervisors.map((user) => user.id)
  }

  const uniqueUserIds = [...new Set(userIds)]

  if (uniqueUserIds.length === 0) return

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      tenantId: params.tenantId,
      userId: {
        in: uniqueUserIds
      },
      enabled: true
    }
  })

  if (subscriptions.length === 0) return

  const leadName = conversation.contact?.name || 'Lead'

  await Promise.all(
    subscriptions.map((subscription) =>
      sendPushNotification({
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        payload: {
          title: `Nova mensagem de ${leadName}`,
          body: getPushPreview(params.content),
          url: `/dashboard?conversationId=${params.conversationId}`,
          conversationId: params.conversationId
        }
      })
    )
  )
}