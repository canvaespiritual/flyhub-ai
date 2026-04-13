import Fastify from 'fastify'
import cors from '@fastify/cors'
import { healthRoutes } from './routes/health.js'
import { conversationRoutes } from './routes/conversations.js'
import { messageRoutes } from './routes/messages.js'
import { realtimeRoutes } from './routes/realtime.js'

export async function buildApp() {
  const app = Fastify({
    logger: true
  })

  await app.register(cors, {
    origin: true
  })

  await app.register(healthRoutes, { prefix: '/api' })
  await app.register(conversationRoutes, { prefix: '/api' })
  await app.register(messageRoutes, { prefix: '/api' })
  await app.register(realtimeRoutes, { prefix: '/api' })

  return app
}