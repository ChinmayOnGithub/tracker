const dbUrl = process.env.DATABASE_URL || ''
if (dbUrl.includes('supabase.com') || dbUrl.includes('pooler.supabase.com') || process.env.NODE_ENV === 'production') {
  console.error('CRITICAL SAFETY BLOCK: Database seeding is blocked on production/Supabase instances to prevent data loss.')
  process.exit(1)
}
process.env.ALLOW_UNSAFE_DB_OPERATIONS = 'true'

import { db } from '../lib/db'

async function run() {
  const username = 'amruta'
  const user = await db.user.findUnique({
    where: { username }
  })

  if (!user) {
    console.log(`User ${username} not found!`)
    return
  }

  // Delete all existing templates for amruta
  console.log(`Deleting templates for ${username}...`)
  await db.activityTemplate.deleteMany({
    where: { userId: user.id }
  })

  console.log(`Adding 3 correct starter templates for ${username}...`)
  await db.activityTemplate.createMany({
    data: [
      {
        userId: user.id,
        name: 'Reading Book',
        category: 'personal',
        icon: 'BookOpen',
        color: 'green',
        recurrenceType: 'daily',
        sortOrder: 1,
        notes: 'Read at least 15 pages',
      },
      {
        userId: user.id,
        name: 'Wash Hairs',
        category: 'personal',
        icon: 'ShowerHead',
        color: 'blue',
        recurrenceType: 'custom',
        recurrenceInterval: 3,
        sortOrder: 2,
        notes: 'Wash and condition hair',
      },
      {
        userId: user.id,
        name: 'Netflix Subscription',
        category: 'finance',
        icon: 'Tv',
        color: 'red',
        recurrenceType: 'monthly',
        recurrenceDayOfMonth: 15,
        amount: 199.00,
        sortOrder: 3,
        notes: 'Monthly standard stream plan',
      }
    ]
  })

  console.log('Done!')
}

run().catch(console.error)
