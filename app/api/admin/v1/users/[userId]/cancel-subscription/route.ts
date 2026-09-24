import { NextResponse } from 'next/server'
import { AdminService } from '@/lib/services/AdminService'

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const auth = await AdminService.verifyAdminAuth(request.headers)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const { userId } = await context.params

  let reason = 'Admin scheduled cancellation at period end'
  try {
    const body = await request.json()
    if (body?.reason && typeof body.reason === 'string') {
      reason = body.reason
    }
  } catch {
    // Body is optional
  }

  try {
    const result = await AdminService.cancelSubscription(auth.actor, userId, reason)
    return NextResponse.json({
      success: true,
      message: 'Subscription scheduled for cancellation at period end.',
      effectiveDate: result.effectiveDate.toISOString()
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel subscription'
    const status = message.includes('No active subscription') || message.includes('No cancellable') ? 404 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
