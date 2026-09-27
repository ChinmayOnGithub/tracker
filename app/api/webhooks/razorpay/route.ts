import { NextRequest, NextResponse } from 'next/server'
import { BillingService } from '@/lib/services/BillingService'

export const dynamic = 'force-dynamic'

/**
 * Razorpay Dedicated Webhook Handler
 *
 * Requirements:
 * 1. Must read raw body as text for HMAC SHA-256 signature verification.
 * 2. Cryptographic timing-safe verification.
 * 3. Idempotent event deduplication via BillingWebhookEvent table.
 * 4. Safe failure recovery without duplicate subscription or payment mutations.
 */
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-razorpay-signature')
    if (!signature) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Missing required x-razorpay-signature header'
          }
        },
        { status: 400 }
      )
    }

    const rawBody = await req.text()
    if (!rawBody) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Empty webhook payload'
          }
        },
        { status: 400 }
      )
    }

    const result = await BillingService.processWebhook('RAZORPAY', rawBody, signature)

    if (result.status >= 400) {
      return NextResponse.json(
        {
          error: {
            code: 'WEBHOOK_PROCESSING_FAILED',
            message: 'Webhook could not be processed.'
          }
        },
        { status: result.status }
      )
    }

    return NextResponse.json(
      { message: result.message },
      { status: result.status }
    )
  } catch (error) {
    console.error('Unhandled Razorpay webhook error:', error)
    return NextResponse.json(
      {
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Webhook could not be processed.'
        }
      },
      { status: 500 }
    )
  }
}
