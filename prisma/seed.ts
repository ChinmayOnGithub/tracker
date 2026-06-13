import { db } from '../lib/db'

async function main() {
  console.log('Clearing database...')
  await db.activityLog.deleteMany()
  await db.note.deleteMany()
  await db.activityTemplate.deleteMany()
  await db.tag.deleteMany()

  console.log('Creating tags...')
  const tagHealth = await db.tag.create({ data: { name: 'health', color: 'red' } })
  const tagFitness = await db.tag.create({ data: { name: 'fitness', color: 'blue' } })
  const tagFinance = await db.tag.create({ data: { name: 'finance', color: 'green' } })
  const tagPersonal = await db.tag.create({ data: { name: 'personal', color: 'purple' } })
  const tagHabits = await db.tag.create({ data: { name: 'habits', color: 'amber' } })

  console.log('Creating templates...')

  // 1. Multivitamin
  const tVitamins = await db.activityTemplate.create({
    data: {
      name: 'Take Multivitamin',
      category: 'health',
      icon: 'Pill',
      color: 'red',
      recurrenceType: 'daily',
      sortOrder: 1,
      notes: 'Take with breakfast',
      tags: { connect: [{ id: tagHealth.id }, { id: tagHabits.id }] },
    },
  })

  // 2. Daily Journal
  const tJournal = await db.activityTemplate.create({
    data: {
      name: 'Write Daily Journal',
      category: 'personal',
      icon: 'BookOpen',
      color: 'amber',
      recurrenceType: 'daily',
      sortOrder: 2,
      notes: 'Write at least 3 bullet points about the day',
      tags: { connect: [{ id: tagPersonal.id }, { id: tagHabits.id }] },
    },
  })

  // 3. Training Session
  const tWorkout = await db.activityTemplate.create({
    data: {
      name: 'Training Session',
      category: 'fitness',
      icon: 'Dumbbell',
      color: 'blue',
      recurrenceType: 'weekly',
      recurrenceDaysOfWeek: '1,3,5', // Mon, Wed, Fri
      sortOrder: 3,
      notes: 'Bodyweight, strength, or yoga session',
      tags: { connect: [{ id: tagFitness.id }] },
    },
  })

  // 4. Spotify Subscription
  const tSpotify = await db.activityTemplate.create({
    data: {
      name: 'Spotify Subscription',
      category: 'finance',
      icon: 'Music',
      color: 'green',
      recurrenceType: 'monthly',
      recurrenceDayOfMonth: 15,
      amount: 179.00,
      sortOrder: 4,
      notes: 'Family plan auto-renewal',
      tags: { connect: [{ id: tagFinance.id }] },
    },
  })

  // 5. Haircut
  const tHaircut = await db.activityTemplate.create({
    data: {
      name: 'Get Haircut',
      category: 'personal',
      icon: 'Scissors',
      color: 'purple',
      recurrenceType: 'milestone',
      sortOrder: 5,
      notes: 'Keep it short on the sides',
      tags: { connect: [{ id: tagPersonal.id }] },
    },
  })

  // 6. Domain Renewal
  await db.activityTemplate.create({
    data: {
      name: 'Domain Renewal (my-portfolio.com)',
      category: 'finance',
      icon: 'Globe',
      color: 'orange',
      recurrenceType: 'yearly',
      recurrenceMonth: 6,
      recurrenceDayOfMonth: 20,
      amount: 999.00,
      sortOrder: 6,
      notes: 'Namecheap registrar auto-renew',
      tags: { connect: [{ id: tagFinance.id }] },
    },
  })

  // 7. Wash Hair
  const tWashHair = await db.activityTemplate.create({
    data: {
      name: 'Wash Hair',
      category: 'personal',
      icon: 'Droplet',
      color: 'blue',
      recurrenceType: 'milestone',
      sortOrder: 7,
      notes: 'Use dandruff shampoo. Massage scalp.',
      tags: { connect: [{ id: tagPersonal.id }] },
    },
  })

  // 8. Japa Mala
  const tJapaMala = await db.activityTemplate.create({
    data: {
      name: 'Japa Mala',
      category: 'personal',
      icon: 'JapaMala',
      color: 'red',
      recurrenceType: 'daily',
      sortOrder: 8,
      notes: '108 mantra repetitions',
      tags: { connect: [{ id: tagPersonal.id }, { id: tagHabits.id }] },
    },
  })

  // 9. Read Book
  const tReadBook = await db.activityTemplate.create({
    data: {
      name: 'Read Book',
      category: 'personal',
      icon: 'BookOpen',
      color: 'purple',
      recurrenceType: 'daily',
      sortOrder: 9,
      notes: 'Read at least 10 pages',
      tags: { connect: [{ id: tagPersonal.id }, { id: tagHabits.id }] },
    },
  })

  // 10. Running Log
  const tRunning = await db.activityTemplate.create({
    data: {
      name: 'Running Log',
      category: 'fitness',
      icon: 'TrendingUp',
      color: 'blue',
      recurrenceType: 'weekly',
      recurrenceDaysOfWeek: '0,4', // Sun, Thu
      sortOrder: 10,
      notes: 'Log outdoor runs (distance, duration, energy)',
      tags: { connect: [{ id: tagFitness.id }, { id: tagHabits.id }] },
    },
  })

  // 11. Weekly Measurements
  const tMeasurements = await db.activityTemplate.create({
    data: {
      name: 'Weekly Measurements',
      category: 'health',
      icon: 'Heart',
      color: 'purple',
      recurrenceType: 'weekly',
      recurrenceDaysOfWeek: '0', // Sunday
      sortOrder: 11,
      notes: 'Track weight, waist, chest, and arms weekly',
      tags: { connect: [{ id: tagHealth.id }] },
    },
  })

  console.log('Generating logs...')
  const logs = []
  const today = new Date()

  // Generate logs for the last 30 days
  for (let i = 30; i >= 0; i--) {
    const targetDate = new Date()
    targetDate.setDate(today.getDate() - i)
    const dateStr = targetDate.toISOString().split('T')[0]

    // 1. Vitamins - logged 90% of the time
    if (Math.random() < 0.9 && i > 0) {
      logs.push({
        activityId: tVitamins.id,
        date: dateStr,
        status: 'done',
        note: 'Completed in the morning',
      })
    }

    // 2. Journal - logged 75% of the time
    if (Math.random() < 0.75 && i > 0) {
      logs.push({
        activityId: tJournal.id,
        date: dateStr,
        status: 'done',
        note: `Day review #${30 - i}. Felt productive.`,
      })
    }

    // 2b. Japa Mala - logged 80% of the time
    if (Math.random() < 0.8 && i > 0) {
      logs.push({
        activityId: tJapaMala.id,
        date: dateStr,
        status: 'done',
        note: '108 mantra repetitions completed',
      })
    }

    // 2c. Read Book - logged 70% of the time
    if (Math.random() < 0.7 && i > 0) {
      logs.push({
        activityId: tReadBook.id,
        date: dateStr,
        status: 'done',
        note: 'Read 10 pages',
      })
    }

    // 3. Training Session - on Mon, Wed, Fri
    const dayOfWeek = targetDate.getDay() // 0 = Sun, 1 = Mon, etc.
    if ([1, 3, 5].includes(dayOfWeek) && i > 0) {
      const isMon = dayOfWeek === 1
      const isWed = dayOfWeek === 3
      
      const exercises = isMon
        ? [
            {
              name: 'Squats',
              sets: [
                { reps: 25 },
                { reps: 25 },
                { reps: 20 },
              ],
              note: 'Bodyweight, deep sets',
            },
            {
              name: 'Lunges',
              sets: [
                { reps: 15 },
                { reps: 15 },
              ],
            },
            {
              name: 'Plank',
              sets: [
                { reps: 1, note: '60 seconds' },
                { reps: 1, note: '45 seconds' },
              ],
            },
          ]
        : isWed
        ? [
            {
              name: 'Pushups',
              sets: [
                { reps: 20 },
                { reps: 15 },
                { reps: 12 },
              ],
            },
            {
              name: 'Dips',
              sets: [
                { reps: 12 },
                { reps: 10 },
              ],
            },
            {
              name: 'Suryanamaskar',
              sets: [
                { reps: 12 },
              ],
            },
          ]
        : [
            {
              name: 'Pullups',
              sets: [
                { reps: 8 },
                { reps: 6 },
                { reps: 5 },
              ],
            },
            {
              name: 'Bodyweight Rows',
              sets: [
                { reps: 12 },
                { reps: 10 },
              ],
            },
            {
              name: 'Yoga Stretch',
              sets: [
                { reps: 1, note: '15 minutes mobility' },
              ],
            },
          ]

      logs.push({
        activityId: tWorkout.id,
        date: dateStr,
        status: 'done',
        note: isMon ? 'Lower body focus' : isWed ? 'Upper body push' : 'Pull & mobility',
        payload: {
          exercises,
          energy: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
        },
      })
    }

    // Running Log - on Sun and Thu
    if ([0, 4].includes(dayOfWeek) && i > 0) {
      logs.push({
        activityId: tRunning.id,
        date: dateStr,
        status: 'done',
        note: 'Evening run',
        payload: {
          distance: parseFloat((3.5 + Math.random() * 3).toFixed(2)),
          duration: Math.floor(20 + Math.random() * 20),
          energy: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
        },
      })
    }

    // Weekly Measurements - on Sunday
    if (dayOfWeek === 0 && i > 0) {
      logs.push({
        activityId: tMeasurements.id,
        date: dateStr,
        status: 'done',
        note: 'Morning tracking',
        payload: {
          weight: parseFloat((75.0 - (30 - i) * 0.1 + Math.random() * 0.4).toFixed(1)),
          waist: parseFloat((34.0 - (30 - i) * 0.02 + Math.random() * 0.1).toFixed(1)),
          chest: parseFloat((40.0 + Math.random() * 0.2).toFixed(1)),
          arms: parseFloat((14.5 + Math.random() * 0.1).toFixed(1)),
        },
      })
    }
  }

  // 4. Spotify Sub payments - paid on May 15
  // (Let's assume today is in June 2026, so May 15 is 29 days ago)
  const prevMonthDate = new Date()
  prevMonthDate.setDate(today.getDate() - 29)
  const prevSpotifyDateStr = prevMonthDate.toISOString().split('T')[0]
  logs.push({
    activityId: tSpotify.id,
    date: prevSpotifyDateStr,
    status: 'paid',
    amount: 179.00,
    note: 'Automatic visa card billing',
  })

  // 5. Haircut - 45 days ago
  const haircutDate = new Date()
  haircutDate.setDate(today.getDate() - 45)
  const haircutDateStr = haircutDate.toISOString().split('T')[0]
  logs.push({
    activityId: tHaircut.id,
    date: haircutDateStr,
    status: 'done',
    note: 'Standard haircut at local barber',
  })

  // 6. Wash Hair - 3, 8, and 14 days ago
  const washDate1 = new Date()
  washDate1.setDate(today.getDate() - 3)
  logs.push({
    activityId: tWashHair.id,
    date: washDate1.toISOString().split('T')[0],
    status: 'done',
    note: 'Scalp massage done',
  })

  const washDate2 = new Date()
  washDate2.setDate(today.getDate() - 8)
  logs.push({
    activityId: tWashHair.id,
    date: washDate2.toISOString().split('T')[0],
    status: 'done',
  })

  const washDate3 = new Date()
  washDate3.setDate(today.getDate() - 14)
  logs.push({
    activityId: tWashHair.id,
    date: washDate3.toISOString().split('T')[0],
    status: 'done',
  })

  console.log(`Inserting ${logs.length} activity logs...`)
  for (const log of logs) {
    await db.activityLog.create({
      data: log,
    })
  }

  console.log('Creating some standalone daily notes...')
  const notesMock = [
    {
      date: addDaysStr(today.toISOString().split('T')[0], -2),
      title: 'Idea Draft',
      content: 'Brainstormed layout for personal tracker app. Decided on side-by-side layout.',
    },
    {
      date: addDaysStr(today.toISOString().split('T')[0], -8),
      title: 'Grocery List',
      content: 'Bought: Eggs, milk, bread, chicken breast, coffee beans, spinach.',
    },
    {
      date: addDaysStr(today.toISOString().split('T')[0], -14),
      title: 'Weekend Reflection',
      content: 'Spent Sunday hiking at the park. Great weather, clear sky. Walked 12k steps.',
    },
  ]

  for (const note of notesMock) {
    await db.note.create({
      data: note,
    })
  }

  console.log('Seed database successfully populated!')
}

// Simple helper to add days in string operations
function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  const newY = date.getUTCFullYear()
  const newM = String(date.getUTCMonth() + 1).padStart(2, '0')
  const newD = String(date.getUTCDate()).padStart(2, '0')
  return `${newY}-${newM}-${newD}`
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
