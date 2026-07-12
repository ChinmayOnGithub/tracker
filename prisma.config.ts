import { defineConfig } from 'prisma/config'
import fs from 'fs'
import path from 'path'

// Custom .env parser to ensure environment variables are populated for Prisma CLI
try {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8')
    for (const line of envConfig.split('\n')) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/)
      if (match) {
        const key = match[1]
        let val = match[2].trim()
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1)
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1)
        }
        process.env[key] = val
      }
    }
  }
} catch (e) {
  console.error('Failed to parse .env file in prisma.config.ts:', e)
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
  migrations: {
    seed: 'bun ./prisma/seed.ts',
  },
})
