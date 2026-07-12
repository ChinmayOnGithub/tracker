import { db } from '../lib/db'

async function main() {
  console.log('Checking User table...')
  try {
    const users = await db.$queryRawUnsafe(`SELECT id, username, email, "googleId" FROM public."User";`)
    console.log('All Users:', users)
  } catch (error) {
    console.error('✗ Failed:', error)
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
