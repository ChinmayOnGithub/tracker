import { db } from './db'
import { getLoggedUser } from '@/app/actions/auth'

export async function requireAuth() {
  const user = await getLoggedUser()
  if (!user) {
    throw new Error('Authentication required')
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
