import { NextResponse } from 'next/server'
import { AdminService } from '@/lib/services/AdminService'

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const auth = await AdminService.verifyAdminAuth(request.headers)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const { userId } = await context.params

  try {
    const userDetails = await AdminService.getUser(userId)
    return NextResponse.json({ success: true, data: userDetails })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'User not found'
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
