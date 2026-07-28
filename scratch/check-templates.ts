import { db } from '../lib/db'

async function check() {
  const templates = await db.activityTemplate.findMany({
    where: { deletedAt: null }
  })
  console.log("TEMPLATES:")
  for (const t of templates) {
    console.log(`- ID: ${t.id}, Name: "${t.name}", Type: ${t.type}, Category: ${t.category}, Metadata:`, JSON.stringify(t.metadata))
  }
}

check().catch(console.error)
