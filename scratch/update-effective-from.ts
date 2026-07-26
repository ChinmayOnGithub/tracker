import { db } from '../lib/db'

async function main() {
  const templates = await db.activityTemplate.findMany()
  console.log(`Found ${templates.length} templates to process.`)
  
  let count = 0
  for (const t of templates) {
    await db.activityTemplate.update({
      where: { id: t.id },
      data: {
        effectiveFrom: t.createdAt
      }
    })
    count++
  }
  console.log(`Successfully updated ${count} templates.`)
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))
