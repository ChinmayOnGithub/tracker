/**
 * Sync Health Check Endpoint
 * Used by network manager to test connectivity
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: Date.now(),
    version: '1.0.0'
  })
}