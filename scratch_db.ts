import { createNote, updateNote } from './app/actions/note'
import { db } from './lib/db'

// We will test creating a note for chinmaydpatil09
// Let's mock the session by changing the import or database state if needed,
// but since createNote calls getLoggedUser, let's see how getLoggedUser resolves.
// Wait, we can mock getLoggedUser in the global scope if next.js allows it, 
// or we can just test writing directly to prisma to check if there are any db constraint errors!
async function main() {
  const userId = "949758b3-3f07-4182-aa13-315330f88f1b" // chinmaydpatil09
  console.log('Testing direct database write...')
  
  const testNote = await db.note.create({
    data: {
      date: "2026-07-12",
      content: "Direct DB write test reflection note",
      userId: userId,
      title: "Daily Reflection"
    }
  })
  console.log('Created test note successfully in DB:', testNote)

  // Clean up
  await db.note.delete({
    where: { id: testNote.id }
  })
  console.log('Deleted test note successfully.')
}

main().catch(console.error)
