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
const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL env variable is not set")
  }
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof prismaClientSingleton> | undefined
}

export const db = globalForPrisma.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
