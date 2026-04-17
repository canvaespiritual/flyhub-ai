import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { conversationRoutes } from './routes/conversations.js'
import { messageRoutes } from './routes/messages.js'
import { realtimeRoutes } from './routes/realtime.js'
import { userRoutes } from './routes/users.js'
import { presenceRoutes } from './routes/presence.js'
import { whatsappWebhookRoutes } from './routes/whatsapp-webhook.js'

export async function buildApp() {
  const app = Fastify({
    logger: true
  })

  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'dev-cookie-secret-change-me'
  })

  await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true)
      return
    }

    const allowedOrigins = [
      process.env.WEB_URL,
      process.env.CORS_ORIGIN,
      'http://localhost:3000'
    ].filter(Boolean)

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error('Not allowed by CORS'), false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflight: true,
  optionsSuccessStatus: 204
})

  await app.register(websocket)

  await app.register(authRoutes, { prefix: '/api' })
  await app.register(healthRoutes, { prefix: '/api' })
  await app.register(conversationRoutes, { prefix: '/api' })
  await app.register(messageRoutes, { prefix: '/api' })
  await app.register(realtimeRoutes, { prefix: '/api' })
  await app.register(userRoutes, { prefix: '/api' })
  await app.register(presenceRoutes, { prefix: '/api' })
  await app.register(whatsappWebhookRoutes, { prefix: '/api' })
console.log(app.printRoutes())

  return app
}