import { PrismaClient } from '@prisma/client'

// ==========================================
// OPTION A: LOCAL SQLITE (Default for testing)
// ==========================================
// import { PrismaLibSql } from '@prisma/adapter-libsql'
// const prismaClientSingleton = () => {
//   const connectionString = process.env.DATABASE_URL || 'file:./dev.db'
//   
//   // Pass configuration object directly to PrismaLibSql in Prisma 7
//   const adapter = new PrismaLibSql({
//     url: connectionString,
//   })
//   return new PrismaClient({ adapter })
// }

// ==========================================
// OPTION B: PRODUCTION POSTGRESQL
// ==========================================
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// List of models supporting soft-deletion (contain `deletedAt` field)
const SOFT_DELETABLE_MODELS = new Set([
  'JournalEntry',
  'LeaveRecord',
  'WeightRecord',
  'WishlistItem',
  'SecureDocument',
  'ActivityTemplate',
  'ActivityLog',
  'Note',
  'LinkCollection',
  'SavedLink',
  'LinkedEventMapping',
])

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL env variable is not set")
  }
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  const client = new PrismaClient({ adapter })

  return client.$extends({
    query: {
      $allModels: {
        async delete({ model, args, query }) {
          // Block hard deletes on soft-deletable tables in normal runtime
          if (process.env.ALLOW_UNSAFE_DB_OPERATIONS !== 'true') {
            if (SOFT_DELETABLE_MODELS.has(model)) {
              throw new Error(
                `CRITICAL SAFETY ERROR: Hard delete is blocked on model '${model}' because it supports soft deletion. Set 'deletedAt = new Date()' instead. (To override, run with ALLOW_UNSAFE_DB_OPERATIONS=true)`
              )
            }
          }
          return query(args)
        },
        async deleteMany({ model, args, query }) {
          // Block bulk deletes in normal runtime
          if (process.env.ALLOW_UNSAFE_DB_OPERATIONS !== 'true') {
            // 1. Block unscoped bulk deletes (where is empty or undefined)
            const isUnscoped = !args.where || Object.keys(args.where).length === 0
            if (isUnscoped) {
              throw new Error(
                `CRITICAL SAFETY ERROR: Unscoped deleteMany is strictly blocked on model '${model}' to prevent database wiping. (To override, run with ALLOW_UNSAFE_DB_OPERATIONS=true)`
              )
            }

            // 2. Block hard deleteMany on soft-deletable models
            if (SOFT_DELETABLE_MODELS.has(model)) {
              throw new Error(
                `CRITICAL SAFETY ERROR: Hard deleteMany is blocked on model '${model}' because it supports soft deletion. Update 'deletedAt' instead. (To override, run with ALLOW_UNSAFE_DB_OPERATIONS=true)`
              )
            }
          }
          return query(args)
        }
      }
    }
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof prismaClientSingleton> | undefined
}

export const db = globalForPrisma.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
