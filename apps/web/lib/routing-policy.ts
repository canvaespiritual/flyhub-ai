type AssignableUser = {
  id: string
  role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
  isActive: boolean
  presenceStatus?: 'AVAILABLE' | 'PAUSED' | null
}

export function isUserEligibleForAssignment(user: AssignableUser) {
  const canReceiveByRole = user.role === 'AGENT' || user.role === 'MANAGER'
  const isAvailable = (user.presenceStatus ?? 'AVAILABLE') === 'AVAILABLE'

  return user.isActive && canReceiveByRole && isAvailable
}

export function getEligibleAssignableUsers<T extends AssignableUser>(users: T[]) {
  return users.filter(isUserEligibleForAssignment)
}