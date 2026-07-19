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
  let record: any = null
  if (model === 'savedLink') {
    record = await db.savedLink.findUnique({
      where: { id },
      include: { collection: true }
    })
  } else {
    record = await (db[model] as any).findUnique({
      where: { id }
    })
  }
  
  if (!record) {
    throw new Error(`${model} record not found`)
  }
  
  const ownerId = model === 'savedLink' ? record.collection.userId : record.userId
  const isOwner = ownerId === user.id || (ownerId === null && user.username === 'admin')
  if (!isOwner) {
    throw new Error(`Unauthorized ${model} access`)
  }
  
  return { record, user }
}
