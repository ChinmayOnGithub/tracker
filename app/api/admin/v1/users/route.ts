import { NextResponse } from 'next/server'
import { AdminService } from '@/lib/services/AdminService'

export async function GET(request: Request) {
  const auth = await AdminService.verifyAdminAuth(request.headers)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0
  const search = searchParams.get('search') || undefined

  try {
    const data = await AdminService.listUsers({ limit, offset, search })
    return NextResponse.json({ success: true, ...data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list users'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
