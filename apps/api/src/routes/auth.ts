import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSession,
  getSessionFromRequest,
  revokeSessionByToken,
  touchUserLastLogin,
  validateUser
} from '../lib/auth.js'

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

function serializeUser(user: {
  id: string
  name: string
  email: string
  role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
  tenantId: string
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.toLowerCase(),
    tenantId: user.tenantId
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsedBody = loginBodySchema.safeParse(request.body)

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados de login inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const { email, password } = parsedBody.data

    const user = await validateUser(email, password)

    if (!user) {
      return reply.status(401).send({
        message: 'Credenciais inválidas'
      })
    }

    const { rawToken } = await createSession(user, request)
    await touchUserLastLogin(user.id)

    reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: Math.floor(SESSION_TTL_MS / 1000)
})

    return {
      user: serializeUser(user)
    }
  })

  app.get('/auth/me', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    return {
      user: serializeUser(session.user)
    }
  })

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE_NAME]

    await revokeSessionByToken(token)

    reply.clearCookie(SESSION_COOKIE_NAME, {
  path: '/',
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production'
})

    return { ok: true }
  })
}