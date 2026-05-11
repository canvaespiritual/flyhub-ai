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