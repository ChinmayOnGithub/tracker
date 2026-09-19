import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()

  try {
    // Verify database connectivity
    await db.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - startTime

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: 'connected',
        latencyMs
      },
      environment: process.env.NODE_ENV || 'development'
    }, { status: 200 })
  } catch (error) {
    const latencyMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('HealthCheck', 'Database health check probe failed', { error: errorMessage, latencyMs })

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: 'Database connectivity failure'
      },
      environment: process.env.NODE_ENV || 'development'
    }, { status: 503 })
  }
}
