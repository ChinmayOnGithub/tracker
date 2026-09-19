import { describe, it, expect } from 'bun:test'
import { GET } from '@/app/api/health/route'
import { db } from '@/lib/db'

describe('Production Health Check Endpoint (#32)', () => {
  it('returns HTTP 200 with database: connected when DB is responsive', async () => {
    const originalQueryRaw = db.$queryRaw
    try {
      ;(db as unknown as { $queryRaw: () => Promise<unknown> }).$queryRaw = async () => [{ '?column?': 1 }]

      const response = await GET()
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body.status).toBe('healthy')
      expect(body.database.status).toBe('connected')
      expect(typeof body.database.latencyMs).toBe('number')
      expect(body.timestamp).toBeDefined()
    } finally {
      ;(db as unknown as { $queryRaw: unknown }).$queryRaw = originalQueryRaw
    }
  })

  it('returns HTTP 503 with database: disconnected when DB query fails', async () => {
    const originalQueryRaw = db.$queryRaw
    try {
      ;(db as unknown as { $queryRaw: () => Promise<unknown> }).$queryRaw = async () => {
        throw new Error('Connection refused to postgres:5432')
      }

      const response = await GET()
      expect(response.status).toBe(503)

      const body = await response.json()
      expect(body.status).toBe('unhealthy')
      expect(body.database.status).toBe('disconnected')
    } finally {
      ;(db as unknown as { $queryRaw: unknown }).$queryRaw = originalQueryRaw
    }
  })
})
