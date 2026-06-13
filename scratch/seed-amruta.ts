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

  // Check if they already have templates
  const existingCount = await db.activityTemplate.count({
    where: { userId: user.id }
  })

  if (existingCount > 0) {
    console.log(`User ${username} already has ${existingCount} templates. Skipping.`)
    return
  }

  console.log(`Adding 3 starter templates for ${username}...`)
  await db.activityTemplate.createMany({
    data: [
      {
        userId: user.id,
        name: 'Take Multivitamin',
        category: 'health',
        icon: 'Pill',
        color: 'red',
        recurrenceType: 'daily',
        sortOrder: 1,
        notes: 'Take with breakfast',
      },
      {
        userId: user.id,
        name: 'Write Daily Journal',
        category: 'personal',
        icon: 'BookOpen',
        color: 'amber',
        recurrenceType: 'daily',
        sortOrder: 2,
        notes: 'Write at least 3 bullet points about the day',
      },
      {
        userId: user.id,
        name: 'Training Session',
        category: 'fitness',
        icon: 'Dumbbell',
        color: 'blue',
        recurrenceType: 'weekly',
        recurrenceDaysOfWeek: '1,3,5',
        sortOrder: 3,
        notes: 'Strength, cardio, or yoga',
      }
    ]
  })

  console.log('Done!')
}

run().catch(console.error)
