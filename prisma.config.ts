import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL') || env('DATABASE_URL'),
  },
  migrations: {
    seed: 'bun ./prisma/seed.ts',
  },
})
