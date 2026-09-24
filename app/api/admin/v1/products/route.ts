import { NextResponse } from 'next/server'
import { AdminService } from '@/lib/services/AdminService'

export async function GET(request: Request) {
  const auth = await AdminService.verifyAdminAuth(request.headers)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const products = AdminService.listProducts()
  return NextResponse.json({ success: true, products })
}
