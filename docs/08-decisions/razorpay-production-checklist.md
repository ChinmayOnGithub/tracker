# Razorpay Production Readiness & Live Billing Checklist (#52)

## 1. Environment Separation (Test vs Live)

| Configuration Item | Test Mode Prefix / Pattern | Live Mode Prefix / Pattern | Notes |
| :--- | :--- | :--- | :--- |
| **API Key ID** | `rzp_test_...` | `rzp_live_...` | Hard guard in `RazorpayProvider`: live mode rejects test keys when `RAZORPAY_ENFORCE_LIVE=true`. |
| **API Key Secret** | Alphanumeric secret | High-entropy secret | Injected strictly via environment variables. Never committed to git. |
| **Plan ID (Monthly)** | `plan_TdpzGACweUZ0Qj` | `plan_live_...` | Created separately in Razorpay Live Dashboard. |
| **Plan ID (Annual)** | `plan_test_...` | `plan_live_...` | Created separately in Razorpay Live Dashboard. |
| **Introductory Offer ID** | `offer_test_...` | `offer_live_...` | Linked to 1st cycle discount in Live Dashboard. |
| **Webhook Secret** | Custom secret string | Dedicated live secret | Verified via HMAC-SHA256 in `/api/billing/webhook`. |

---

## 2. Webhook Verification & Lifecycle Management

* **Endpoint**: `https://<DOMAIN>/api/billing/webhook`
* **HMAC Signature**: Checked with `crypto.createHmac('sha256', secret).update(body).digest('hex')` against `x-razorpay-signature`.
* **Idempotency**: Webhook events logged in `BillingWebhookEvent` table. Duplicate events with same `eventId` are idempotently skipped with HTTP 200.
* **Handled Lifecycle Events**:
  * `subscription.authenticated`: Initial auth confirmed, local subscription record linked.
  * `subscription.activated`: Subscription is active, entitlements updated to PRO.
  * `subscription.charged`: Recurring cycle payment confirmed, billing history appended, `currentPeriodEnd` refreshed.
  * `subscription.halted`: Payment retries exhausted, subscription halted, graceful entitlement downgrade.
  * `subscription.cancelled`: Cancellation recorded, access retained until `currentPeriodEnd`.
  * `payment.failed`: Failure logged, user notified in billing history.

---

## 3. Website Compliance & Merchant Prerequisites

Prior to switching Razorpay to **Live Mode**, the public website must satisfy payment aggregator compliance:

* [x] **HTTPS Everywhere**: All API routes and pages served over TLS.
* [x] **Clear Product Descriptions**: Pricing panel specifies exact deliverables (Calendar, Journal export, Vault limits, Notes).
* [x] **Transparent Pricing**: Explicit currency (`INR`), cadence (Monthly / Annual), and introductory discount terms.
* [x] **Terms of Service**: Available at `/terms` detailing license, user responsibilities, and subscription terms.
* [x] **Privacy Policy**: Available at `/privacy` detailing zero-knowledge vault storage and data handling.
* [x] **Cancellation & Refund Policy**: Documented under billing policies (cancel at period end, pro-rated terms).
* [x] **Support / Merchant Contact**: Clear contact email and registered merchant identity.
* [x] **Zero Test Wording**: All test-mode indicators removed from customer-facing checkout in production.

---

## 4. Fail-Closed & Reconciliation Invariants

1. **Client Checkout is Non-Authoritative**: The frontend checkout modal receipt is merely an informational signal to trigger revalidation. No Pro entitlement is ever granted without server-side verification from Razorpay or a signed webhook.
2. **Auto-Reconciliation Loop**: Any subscription stuck in `PENDING` or `CREATED` is reconciled server-side against Razorpay's `/subscriptions/{id}` API before loading billing summaries.
3. **Graceful Downgrade**: If payment fails or subscription expires, existing vault files and user data are strictly preserved; only new creations exceeding Free limits are restricted.
