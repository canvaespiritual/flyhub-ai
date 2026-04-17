export type PresenceStatus = 'available' | 'paused'

export function normalizePresenceStatus(value: string): PresenceStatus | null {
  if (value === 'available') return 'available'
  if (value === 'paused') return 'paused'
  return null
}

export function mapPresenceStatusFromDb(value?: string | null): PresenceStatus {
  if (value === 'PAUSED') return 'paused'
  return 'available'
}

export function mapPresenceStatusToDb(value: PresenceStatus): 'AVAILABLE' | 'PAUSED' {
  if (value === 'paused') return 'PAUSED'
  return 'AVAILABLE'
}

export function canManagePresence(role: string) {
  return role === 'MASTER' || role === 'ADMIN' || role === 'MANAGER' || role === 'AGENT'
}