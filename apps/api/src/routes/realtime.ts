import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { subscribe, unsubscribe } from '../lib/realtime.js'

const realtimeQuerySchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required')
})

type RawReply = FastifyReply['raw']
type RawRequest = FastifyRequest['raw']

function writeSseEvent(reply: RawReply, event: string, data: unknown) {
  reply.write(`event: ${event}\n`)
  reply.write(`data: ${JSON.stringify(data)}\n\n`)
}

export async function realtimeRoutes(app: FastifyInstance) {
  app.get('/realtime', async (request, reply) => {
    const parsedQuery = realtimeQuerySchema.safeParse(request.query)

    if (!parsedQuery.success) {
      return reply.status(400).send({
        message: 'tenantId is required',
        issues: parsedQuery.error.flatten()
      })
    }

    const { tenantId } = parsedQuery.data
    const clientId = randomUUID()

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })

    reply.raw.flushHeaders?.()

    const client = {
      id: clientId,
      send: (data: unknown) => {
        writeSseEvent(reply.raw, 'message', data)
      }
    }

    subscribe(tenantId, client)

    writeSseEvent(reply.raw, 'connected', {
      clientId,
      tenantId,
      connectedAt: new Date().toISOString()
    })

    const heartbeat = setInterval(() => {
      writeSseEvent(reply.raw, 'heartbeat', {
        ts: new Date().toISOString()
      })
    }, 25000)

    const cleanup = () => {
      clearInterval(heartbeat)
      unsubscribe(tenantId, client)
      reply.raw.end()
    }

    request.raw.on('close', cleanup)
    request.raw.on('end', cleanup)
    request.raw.on('error', cleanup)
  })
}