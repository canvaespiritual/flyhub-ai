import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { getSessionFromRequest } from '../lib/auth.js'
import {
  getVapidPublicKey,
  sendPushNotification
} from '../lib/push.js'

type PushSubscribeBody = {
  endpoint?: string
  keys?: {
    p256dh?: string
    auth?: string
  }
}

export async function pushSubscriptionRoutes(app: FastifyInstance) {
  app.get('/push/vapid-public-key', async (_request, reply) => {
    try {
      return reply.send({
        publicKey: getVapidPublicKey()
      })
    } catch (error) {
      return reply.status(500).send({
        error: 'Push notifications are not configured'
      })
    }
  })

  app.post('/push/subscribe', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const body = request.body as PushSubscribeBody

    if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return reply.status(400).send({
        error: 'Invalid push subscription'
      })
    }

    const userAgent =
      typeof request.headers['user-agent'] === 'string'
        ? request.headers['user-agent']
        : null

    const subscription = await prisma.pushSubscription.upsert({
      where: {
        endpoint: body.endpoint
      },
      update: {
        tenantId: session.tenantId,
        userId: session.userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
        enabled: true
      },
      create: {
        tenantId: session.tenantId,
        userId: session.userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
        enabled: true
      }
    })

    return reply.send({
      ok: true,
      id: subscription.id
    })
  })

  app.post('/push/unsubscribe', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const body = request.body as {
      endpoint?: string
    }

    if (!body?.endpoint) {
      return reply.status(400).send({
        error: 'Missing endpoint'
      })
    }

    await prisma.pushSubscription.updateMany({
      where: {
        endpoint: body.endpoint,
        userId: session.userId,
        tenantId: session.tenantId
      },
      data: {
        enabled: false
      }
    })

    return reply.send({ ok: true })
  })

  app.post('/push/test', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        tenantId: session.tenantId,
        userId: session.userId,
        enabled: true
      }
    })

    for (const subscription of subscriptions) {
      await sendPushNotification({
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        payload: {
          title: 'FlyHub AI',
          body: 'Notificações push ativadas com sucesso.',
          url: '/dashboard'
        }
      })
    }

    return reply.send({
      ok: true,
      sent: subscriptions.length
    })
  })
}