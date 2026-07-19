/**
 * One-time script to fix journal entries that were accidentally soft-deleted
 * Run with: bun run scripts/fix-journal-entries.ts
 */

import { db } from '../lib/db'

async function fixJournalEntries() {
  console.log('Checking for soft-deleted journal entries...')
  
  const deletedEntries = await db.journalEntry.findMany({
    where: {
      deletedAt: { not: null }
    },
    select: {
      id: true,
      userId: true,
      journalDate: true,
      content: true,
      deletedAt: true
    }
  })
  
  console.log(`Found ${deletedEntries.length} soft-deleted journal entries`)
  
  if (deletedEntries.length === 0) {
    console.log('No entries to fix!')
    return
  }
  
  // Un-delete all journal entries
  const result = await db.journalEntry.updateMany({
    where: {
      deletedAt: { not: null }
    },
    data: {
      deletedAt: null
    }
  })
  
  console.log(`✅ Restored ${result.count} journal entries`)
  
  // List restored entries
  deletedEntries.forEach(entry => {
    console.log(`  - ${entry.id}: ${entry.journalDate.toISOString()} (${entry.content.length} chars)`)
  })
}

fixJournalEntries()
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
