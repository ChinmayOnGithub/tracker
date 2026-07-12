import { db } from '../lib/db'

async function main() {
  console.log('Checking database state...')
  try {
    const templates = await db.activityTemplate.findMany()
    console.log('Total templates in DB:', templates.length)
    console.log('Templates mapped to user 949758b3-3f07-4182-aa13-315330f88f1b:', templates.filter(t => t.userId === '949758b3-3f07-4182-aa13-315330f88f1b').length)
    console.log('First 3 templates:', templates.slice(0, 3))
  } catch (error) {
    console.error('✗ Failed:', error)
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
