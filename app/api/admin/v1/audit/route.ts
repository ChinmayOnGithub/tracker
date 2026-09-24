import { NextResponse } from 'next/server'
import { AdminService } from '@/lib/services/AdminService'

export async function GET(request: Request) {
  const auth = await AdminService.verifyAdminAuth(request.headers)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50
  const userId = searchParams.get('userId') || undefined

  try {
    const logs = await AdminService.getAuditHistory(userId, limit)
    return NextResponse.json({ success: true, logs })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve audit logs'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
