import { db } from './db'
import { getLoggedUser } from '@/app/actions/auth'
import { isAuthorizedUserEmail } from './constants'

export type TrackerCapability =
  // Private Core Modules (Owner-Only)
  | 'core.owner'
  | 'journal.read'
  | 'journal.write'
  | 'vault.read'
  | 'vault.write'
  | 'calendar.personal'
  | 'leave.read'
  | 'leave.write'
  | 'weight.read'
  | 'weight.write'
  | 'work-hours.read'
  | 'work-hours.write'
  | 'settings.manage'
  // Future Shared Tools (Configurable / Multi-User)
  | 'room-turn.read'
  | 'room-turn.write'
  | 'grocery.read'
  | 'grocery.write'
  | 'shared-finance.read'
  | 'shared-finance.write'

/**
 * Checks whether an authenticated user has authorization for a given capability.
 * Keeps authentication ("who is this user") decoupled from authorization ("what can they do").
 */
export function canAccess(
  user: { id: string; username: string; email?: string | null } | null | undefined,
  capability: TrackerCapability
): boolean {
  if (!user) return false

  // 1. Owner privileges: The whitelisted owner account or legacy 'admin' user has full access
  const isOwner = user.username === 'admin' || isAuthorizedUserEmail(user.email || user.username)

  // 2. Private core capabilities require owner authorization
  const isPrivateCore = capability === 'core.owner' ||
    capability.startsWith('journal.') ||
    capability.startsWith('vault.') ||
    capability.startsWith('calendar.personal') ||
    capability.startsWith('leave.') ||
    capability.startsWith('weight.') ||
    capability.startsWith('work-hours.') ||
    capability.startsWith('settings.')

  if (isPrivateCore) {
    return isOwner
  }

  // 3. Shared tools capability evaluation (open to authenticated users / extensible)
  return true
}

export async function requireAuth() {
  const user = await getLoggedUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

export async function requireCapability(capability: TrackerCapability) {
  const user = await requireAuth()
  if (!canAccess(user, capability)) {
    throw new Error(`Unauthorized: missing capability ${capability}`)
  }
  return user
}

export async function requireOwnership(
  model: 'activityTemplate' | 'activityLog' | 'note' | 'journalEntry' | 'leaveRecord' | 'weightRecord' | 'savedLink' | 'linkCollection' | 'secureDocument' | 'linkTag',
  id: string
) {
  const user = await requireAuth()
  
  // Dynamic lookup on Prisma db client
  let record: Record<string, unknown> | null = null
  if (model === 'savedLink') {
    record = await db.savedLink.findUnique({
      where: { id },
      include: { collection: true }
    })
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic Prisma delegate access
    record = await (db[model] as any).findUnique({
      where: { id }
    })
  }
  
  if (!record) {
    throw new Error(`${model} record not found`)
  }
  
  const collection = record.collection as Record<string, unknown> | undefined
  const ownerId = model === 'savedLink' && collection ? collection.userId : record.userId
  const isOwner = ownerId === user.id || (ownerId === null && user.username === 'admin')
  if (!isOwner) {
    throw new Error(`Unauthorized ${model} access`)
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { record: record as any, user }
}
