import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { subscribe, unsubscribe } from '../lib/realtime.js'
import { getSessionFromRequest } from '../lib/auth.js'

export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/realtime', { websocket: true }, async (socket, request) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      socket.close(1008, 'Unauthorized')
      return
    }

    const client = {
      id: randomUUID(),
      userId: session.user.id,
      tenantId: session.user.tenantId,
      socket
    }

    subscribe(client)

    try {
      socket.send(
        JSON.stringify({
          type: 'connected',
          payload: {
            clientId: client.id,
            tenantId: client.tenantId,
            userId: client.userId,
            connectedAt: new Date().toISOString()
          }
        })
      )
    } catch {
      unsubscribe(client)
      socket.close()
      return
    }

    const heartbeat = setInterval(() => {
      try {
        socket.send(
          JSON.stringify({
            type: 'heartbeat',
            payload: {
              ts: new Date().toISOString()
            }
          })
        )
      } catch {
        clearInterval(heartbeat)
        unsubscribe(client)
        socket.close()
      }
    }, 25000)

    socket.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe(client)
    })

    socket.on('error', () => {
      clearInterval(heartbeat)
      unsubscribe(client)
      socket.close()
    })

    socket.on('message', () => {
      // reservado para futuro:
      // typing, ack, presence, commands
    })
  })
}