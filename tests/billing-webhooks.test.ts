import { describe, it, expect } from 'bun:test'
import crypto from 'crypto'
import { BillingService } from '@/lib/services/BillingService'
import { AuditService } from '@/lib/services/AuditService'
import { RazorpayProvider } from '@/lib/billing/providers/RazorpayProvider'
import { db } from '@/lib/db'

describe('Billing Webhooks & Idempotent Processing Engine', () => {
  const testWebhookSecret = 'test_webhook_secret_key_108'
  const provider = new RazorpayProvider({
    keyId: 'rzp_test_123',
    keySecret: 'secret_123',
    webhookSecret: testWebhookSecret
  })

  function signPayload(body: string, secret = testWebhookSecret): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex')
  }

  it('should accept and verify a valid cryptographic signature', () => {
    const payload = JSON.stringify({ event: 'subscription.activated' })
    const sig = signPayload(payload)

    const isValid = provider.verifyWebhookSignature(payload, sig)
    expect(isValid).toBe(true)
  })

  it('should reject a tampered payload or invalid signature', () => {
    const payload = JSON.stringify({ event: 'subscription.activated' })
    const sig = signPayload(payload)
    const tamperedPayload = JSON.stringify({ event: 'subscription.charged' })

    expect(provider.verifyWebhookSignature(tamperedPayload, sig)).toBe(false)
    expect(provider.verifyWebhookSignature(payload, 'wrong_signature')).toBe(false)
    expect(provider.verifyWebhookSignature('', sig)).toBe(false)
  })

  it('should reject webhooks with 400 when signature verification fails', async () => {
    const payload = JSON.stringify({ event: 'subscription.charged' })
    const badSig = 'completely_invalid_signature_hex'

    const result = await BillingService.processWebhook('RAZORPAY', payload, badSig, provider)
    expect(result.status).toBe(400)
    expect(result.message).toContain('Invalid webhook signature')
  })

  it('should reject malformed non-JSON payloads with 400', async () => {
    const malformedBody = 'NOT_JSON_AT_ALL{[['
    const sig = signPayload(malformedBody)

    const result = await BillingService.processWebhook('RAZORPAY', malformedBody, sig, provider)
    expect(result.status).toBe(400)
    expect(result.message).toContain('Malformed JSON payload')
  })

  it('should process a valid subscription.activated webhook and update local state', async () => {
    const originalFindUnique = db.billingWebhookEvent.findUnique
    const originalUpsertWebhook = db.billingWebhookEvent.upsert
    const originalUpdateWebhook = db.billingWebhookEvent.update
    const originalFindSub = db.subscription.findUnique
    const originalUpdateSub = db.subscription.update
    const originalUpdateCustomer = db.billingCustomer.update

    const originalAuditLog = AuditService.log
    let subscriptionStatus = 'CREATED'
    let webhookEventStatus = 'NONE'

    try {
      // Mock AuditService.log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_1' });
      // Mock db queries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).upsert = async () => ({ id: 'evt_row_1', status: 'PENDING' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).update = async ({ data }: { data: { status: string } }) => {
        webhookEventStatus = data.status
        return { id: 'evt_row_1', status: data.status }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findUnique = async () => ({
        id: 'sub_row_1',
        userId: 'user_1',
        providerSubscriptionId: 'sub_test_100',
        plan: 'PRO_MONTHLY',
        status: 'CREATED',
        isIntroductory: true,
        billingCustomerId: 'cust_1'
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).update = async ({ data }: { data: { status: string } }) => {
        subscriptionStatus = data.status
        return { id: 'sub_row_1', status: data.status }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).update = async () => ({ id: 'cust_1' });

      const payloadObj = {
        entity: 'event',
        account_id: 'acc_test',
        event: 'subscription.activated',
        contains: ['subscription'],
        payload: {
          subscription: {
            entity: {
              id: 'sub_test_100',
              status: 'active',
              current_start: 1726747200,
              current_end: 1729339200
            }
          }
        }
      }

      const rawBody = JSON.stringify(payloadObj)
      const sig = signPayload(rawBody)

      const result = await BillingService.processWebhook('RAZORPAY', rawBody, sig, provider)
      expect(result.status).toBe(200)
      expect(subscriptionStatus).toBe('ACTIVE')
      expect(webhookEventStatus).toBe('PROCESSED')
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = originalFindUnique;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).upsert = originalUpsertWebhook;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).update = originalUpdateWebhook;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findUnique = originalFindSub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).update = originalUpdateSub;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).update = originalUpdateCustomer;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = originalAuditLog;
    }
  })

  it('should process webhook idempotently: duplicate events return 200 without repeating mutations', async () => {
    const originalFindUnique = db.billingWebhookEvent.findUnique
    let mutationAttempted = false

    try {
      // Mock existing webhook event as already PROCESSED
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = async () => ({
        id: 'evt_row_dup',
        provider: 'RAZORPAY',
        providerEventId: 'evt_already_done',
        status: 'PROCESSED'
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).update = async () => {
        mutationAttempted = true
        return {}
      };

      const payloadObj = {
        id: 'evt_already_done',
        event: 'subscription.charged',
        payload: {}
      }

      const rawBody = JSON.stringify(payloadObj)
      const sig = signPayload(rawBody)

      const result = await BillingService.processWebhook('RAZORPAY', rawBody, sig, provider)
      expect(result.status).toBe(200)
      expect(result.message).toBe('Event already processed')
      expect(mutationAttempted).toBe(false)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = originalFindUnique;
    }
  })

  it('should handle out-of-order unknown events gracefully without throwing', async () => {
    const originalFindUnique = db.billingWebhookEvent.findUnique
    const originalUpsertWebhook = db.billingWebhookEvent.upsert
    const originalUpdateWebhook = db.billingWebhookEvent.update

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).upsert = async () => ({ id: 'evt_unk', status: 'PENDING' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).update = async () => ({ id: 'evt_unk', status: 'PROCESSED' });

      const unknownPayload = JSON.stringify({
        id: 'evt_future_unknown',
        event: 'future_feature.unrecognized_event',
        payload: {}
      })
      const sig = signPayload(unknownPayload)

      const result = await BillingService.processWebhook('RAZORPAY', unknownPayload, sig, provider)
      expect(result.status).toBe(200)
      expect(result.message).toBe('Processed successfully')
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = originalFindUnique;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).upsert = originalUpsertWebhook;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).update = originalUpdateWebhook;
    }
  })
})
