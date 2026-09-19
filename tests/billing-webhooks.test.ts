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

  it('should record payment amount strictly from Razorpay event data (paise converted to rupees)', async () => {
    const originalFindUnique = db.billingWebhookEvent.findUnique
    const originalUpsertWebhook = db.billingWebhookEvent.upsert
    const originalUpdateWebhook = db.billingWebhookEvent.update
    const originalFindSub = db.subscription.findUnique
    const originalUpdateSub = db.subscription.update
    const originalUpdateCustomer = db.billingCustomer.update
    const originalUpsertPayment = db.payment.upsert
    const originalAuditLog = AuditService.log

    let recordedAmount = 0
    let recordedStatus = ''

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_charge' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).upsert = async () => ({ id: 'evt_row_charge', status: 'PENDING' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).update = async () => ({ id: 'evt_row_charge', status: 'PROCESSED' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingCustomer as any).update = async () => ({ id: 'cust_charge_1' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findUnique = async () => ({
        id: 'sub_charge_1',
        userId: 'user_charge_1',
        providerSubscriptionId: 'sub_rzp_charge_1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        isIntroductory: true,
        billingCustomerId: 'cust_charge_1'
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).update = async () => ({ id: 'sub_charge_1' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).upsert = async ({ create }: { create: { amount: number; status: string } }) => {
        recordedAmount = create.amount
        recordedStatus = create.status
        return { id: 'pay_row_1' }
      };

      // Test Cycle 1 Intro Payment: 2900 paise = ₹29
      const payloadIntro = {
        id: 'evt_charge_intro',
        event: 'subscription.charged',
        payload: {
          subscription: {
            entity: { id: 'sub_rzp_charge_1', status: 'active', current_start: 1726747200, current_end: 1729339200 }
          },
          payment: {
            entity: { id: 'pay_rzp_intro', amount: 2900, currency: 'INR', status: 'captured', method: 'upi' }
          }
        }
      }

      const bodyIntro = JSON.stringify(payloadIntro)
      const resIntro = await BillingService.processWebhook('RAZORPAY', bodyIntro, signPayload(bodyIntro), provider)
      expect(resIntro.status).toBe(200)
      expect(recordedAmount).toBe(29)
      expect(recordedStatus).toBe('SUCCESS')

      // Test Cycle 2 Recurring Payment: 9900 paise = ₹99
      const payloadRenewal = {
        id: 'evt_charge_renewal',
        event: 'subscription.charged',
        payload: {
          subscription: {
            entity: { id: 'sub_rzp_charge_1', status: 'active', current_start: 1729339200, current_end: 1731931200 }
          },
          payment: {
            entity: { id: 'pay_rzp_renewal', amount: 9900, currency: 'INR', status: 'captured', method: 'card' }
          }
        }
      }

      const bodyRenewal = JSON.stringify(payloadRenewal)
      const resRenewal = await BillingService.processWebhook('RAZORPAY', bodyRenewal, signPayload(bodyRenewal), provider)
      expect(resRenewal.status).toBe(200)
      expect(recordedAmount).toBe(99)
      expect(recordedStatus).toBe('SUCCESS')

      // Test Annual Payment: 79900 paise = ₹799
      const payloadAnnual = {
        id: 'evt_charge_annual',
        event: 'subscription.charged',
        payload: {
          subscription: {
            entity: { id: 'sub_rzp_charge_1', status: 'active', current_start: 1726747200, current_end: 1758283200 }
          },
          payment: {
            entity: { id: 'pay_rzp_annual', amount: 79900, currency: 'INR', status: 'captured', method: 'netbanking' }
          }
        }
      }

      const bodyAnnual = JSON.stringify(payloadAnnual)
      const resAnnual = await BillingService.processWebhook('RAZORPAY', bodyAnnual, signPayload(bodyAnnual), provider)
      expect(resAnnual.status).toBe(200)
      expect(recordedAmount).toBe(799)
      expect(recordedStatus).toBe('SUCCESS')
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
      (db.payment as any).upsert = originalUpsertPayment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = originalAuditLog;
    }
  })

  it('should handle subscription.cancelled webhook by preserving access until period end', async () => {
    const originalFindUnique = db.billingWebhookEvent.findUnique
    const originalUpsertWebhook = db.billingWebhookEvent.upsert
    const originalUpdateWebhook = db.billingWebhookEvent.update
    const originalFindSub = db.subscription.findUnique
    const originalUpdateSub = db.subscription.update
    const originalAuditLog = AuditService.log

    let updatedStatus = ''
    let updatedCancelAtPeriodEnd = false
    const futurePeriodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_cancel' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).upsert = async () => ({ id: 'evt_cancel', status: 'PENDING' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).update = async () => ({ id: 'evt_cancel', status: 'PROCESSED' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findUnique = async () => ({
        id: 'sub_cancel_1',
        userId: 'user_cancel_1',
        providerSubscriptionId: 'sub_rzp_cancel_1',
        plan: 'PRO_MONTHLY',
        status: 'ACTIVE',
        currentPeriodEnd: futurePeriodEnd,
        cancelAtPeriodEnd: false
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).update = async ({ data }: { data: { status: string; cancelAtPeriodEnd: boolean } }) => {
        updatedStatus = data.status
        updatedCancelAtPeriodEnd = data.cancelAtPeriodEnd
        return { id: 'sub_cancel_1' }
      };

      const payload = {
        id: 'evt_cancel_webhook',
        event: 'subscription.cancelled',
        payload: {
          subscription: {
            entity: { id: 'sub_rzp_cancel_1', status: 'cancelled', current_end: Math.floor(futurePeriodEnd.getTime() / 1000) }
          }
        }
      }

      const body = JSON.stringify(payload)
      const res = await BillingService.processWebhook('RAZORPAY', body, signPayload(body), provider)

      expect(res.status).toBe(200)
      expect(updatedStatus).toBe('CANCELLED')
      expect(updatedCancelAtPeriodEnd).toBe(true)
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
      (AuditService as any).log = originalAuditLog;
    }
  })

  it('should handle payment.failed webhook without granting Pro access', async () => {
    const originalFindUnique = db.billingWebhookEvent.findUnique
    const originalUpsertWebhook = db.billingWebhookEvent.upsert
    const originalUpdateWebhook = db.billingWebhookEvent.update
    const originalFindSub = db.subscription.findUnique
    const originalUpsertPayment = db.payment.upsert
    const originalAuditLog = AuditService.log

    let recordedPaymentStatus = ''

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = async () => ({ id: 'audit_fail' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).findUnique = async () => null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).upsert = async () => ({ id: 'evt_fail', status: 'PENDING' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.billingWebhookEvent as any).update = async () => ({ id: 'evt_fail', status: 'PROCESSED' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.subscription as any).findUnique = async () => ({
        id: 'sub_fail_1',
        userId: 'user_fail_1',
        providerSubscriptionId: 'sub_rzp_fail_1'
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.payment as any).upsert = async ({ create }: { create: { status: string } }) => {
        recordedPaymentStatus = create.status
        return { id: 'pay_fail_row' }
      };

      const payload = {
        id: 'evt_pay_failed',
        event: 'payment.failed',
        payload: {
          payment: {
            entity: { id: 'pay_failed_123', amount: 9900, status: 'failed', currency: 'INR' }
          }
        }
      }

      const body = JSON.stringify(payload)
      const res = await BillingService.processWebhook('RAZORPAY', body, signPayload(body), provider)

      expect(res.status).toBe(200)
      expect(recordedPaymentStatus).toBe('FAILED')
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
      (db.payment as any).upsert = originalUpsertPayment;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AuditService as any).log = originalAuditLog;
    }
  })
})
