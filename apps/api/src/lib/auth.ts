import { prisma } from './prisma.js'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

const SESSION_COOKIE_NAME = 'session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 dias

export { SESSION_COOKIE_NAME, SESSION_TTL_MS }

export async function validateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email }
  })

  if (!user || !user.passwordHash || !user.isActive) {
    return null
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)

  if (!isValid) {
    return null
  }

  return user
}

export function createRawSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createSession(user: {
  id: string
  tenantId: string
}, req: {
  ip?: string
  headers?: Record<string, unknown>
}) {
  const rawToken = createRawSessionToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  const session = await prisma.session.create({
    data: {
      tokenHash,
      userId: user.id,
      tenantId: user.tenantId,
      expiresAt,
      ipAddress: req.ip ?? null,
      userAgent:
        typeof req.headers?.['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null
    }
  })

  return {
    session,
    rawToken,
    expiresAt
  }
}

export async function getSessionFromToken(token?: string | null) {
  if (!token) return null

  const tokenHash = hashToken(token)

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: true
    }
  })

  if (!session) return null
  if (session.revokedAt) return null
  if (session.expiresAt < new Date()) return null
  if (!session.user.isActive) return null

  return session
}

export async function getSessionFromRequest(req: {
  cookies?: Record<string, string | undefined>
}) {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  return getSessionFromToken(token)
}

export async function revokeSessionByToken(token?: string | null) {
  if (!token) return

  const tokenHash = hashToken(token)

  await prisma.session.updateMany({
    where: {
      tokenHash,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  })
}

export async function touchUserLastLogin(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date()
    }
  })
}