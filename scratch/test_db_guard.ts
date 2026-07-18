import { db } from '../lib/db'

async function run() {
  console.log("Testing Prisma deleteMany unscoped block...")
  try {
    // This should fail because it's an unscoped deleteMany
    await db.note.deleteMany()
    console.error("FAIL: Unscoped deleteMany did not throw!")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log("SUCCESS: Caught expected error:", msg)
  }

  console.log("\nTesting Prisma delete (hard delete) on soft-deletable model block...")
  try {
    // This should fail because Note is soft-deletable
    await db.note.delete({
      where: { id: "some-dummy-uuid" }
    })
    console.error("FAIL: Hard delete did not throw!")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log("SUCCESS: Caught expected error:", msg)
  }

  console.log("\nTesting bypass with ALLOW_UNSAFE_DB_OPERATIONS=true...")
  process.env.ALLOW_UNSAFE_DB_OPERATIONS = 'true'
  try {
    // This should bypass our guard (and then throw standard Prisma record-not-found, since the UUID is fake)
    await db.note.delete({
      where: { id: "00000000-0000-0000-0000-000000000000" }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("Record to delete does not exist") || msg.includes("An operation failed because a relation constraint was violated")) {
      console.log("SUCCESS: Bypassed database guard (Prisma attempted raw delete, but record didn't exist)")
    } else {
      console.error("FAIL: Unexpected error message:", msg)
    }
  }
}

run()
