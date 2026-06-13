import { db } from '../lib/db'

async function main() {
  console.log('Enabling Row Level Security (RLS) on tables...')
  const tables = ['Tag', 'ActivityTemplate', 'Note', 'ActivityLog', '_TemplateTags']
  
  for (const table of tables) {
    try {
      await db.$executeRawUnsafe(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`)
      console.log(`✓ Enabled RLS on table: ${table}`)
    } catch (error) {
      console.error(`✗ Failed to enable RLS on table: ${table}`, error)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
