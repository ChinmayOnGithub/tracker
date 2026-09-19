# Billing & Subscription System — Architecture & Operations Guide

## Overview

Tracker provides a native, server-authoritative billing foundation designed for sustainable monetization. The architecture decouples the core domain and entitlements from external payment gateways through a provider-neutral interface (`IBillingProvider`), with Razorpay serving as the initial reference integration.

---

## 1. System Architecture

```mermaid
graph TD
    Client[Browser / Client] -->|1. Start Subscription| Actions[Server Actions /actions/billing.ts]
    Actions -->|2. Authorize User| BillingSvc[BillingService lib/services/BillingService.ts]
    BillingSvc -->|3. Check Eligibility & Prep Checkout| Provider[IBillingProvider lib/billing/providers]
    Provider -->|4. Razorpay API| RazorpayGateway[(Razorpay Gateway)]
    RazorpayGateway -->|5. Return Subscription ID| Provider
    BillingSvc -->|6. Safe Checkout Info| Client
    Client -->|7. Open Razorpay Checkout Modal| RazorpayGateway
    RazorpayGateway -->|8. POST Webhook raw bytes| WebhookRoute[/api/webhooks/razorpay]
    WebhookRoute -->|9. Verify HMAC SHA256| Provider
    WebhookRoute -->|10. Idempotent Event Log & Process| BillingSvc
    BillingSvc -->|11. Persist State| DB[(Database / Prisma)]
    BillingSvc -->|12. Audit Log| AuditSvc[AuditService]
    Client -->|13. Check Capabilities| Entitlements[EntitlementService]
    Entitlements -->|14. Calculate Flags| DB
```

### Key Components

1. **Provider Abstraction (`lib/billing/providers/`)**:
   - `IBillingProvider`: Core interface for customer creation, checkout preparation, subscription retrieval, cancellation, webhook verification, and payload normalization.
   - `RazorpayProvider`: Production implementation wrapping the official `razorpay` Node SDK. Uses `crypto.timingSafeEqual` for HMAC SHA-256 webhook validation.
   - `getBillingProvider()` / `setBillingProvider()`: Dependency injection factory enabling seamless test mocking without network calls.

2. **Canonical Plan Configuration (`lib/billing/plans.ts`)**:
   - Central definition of plans, pricing in INR, billing intervals, promotional introductory rules, and feature flags.
   - Plans:
     - `FREE`: Base tier (₹0). Unlimited access to core habit tracking, activities, timeline, calendar, standard notes. Vault limited to 10 files.
     - `PRO_MONTHLY`: ₹99/month, with a ₹29 first-month introductory promotional offer for new subscribers.
     - `PRO_ANNUAL`: ₹799/year (~33% discount vs standard monthly).

3. **Database Ledger (`prisma/schema.prisma`)**:
   - `BillingCustomer`: Links internal `userId` to `providerCustomerId` with `hasUsedIntroductoryOffer` flag.
   - `Subscription`: Tracks canonical application status (`active`, `past_due`, `canceled`, `unpaid`, `incomplete`), current period start/end, and cancel-at-period-end timestamp.
   - `Payment`: Financial ledger storing payment ID, amount, currency, status, and paid timestamp for billing history.
   - `BillingWebhookEvent`: Audit and deduplication table enforcing `@@unique([provider, providerEventId])` for strict idempotency.
   - All models adhere to the AI Constitution with `deletedAt` soft-delete protection in `lib/db.ts`.

4. **Entitlement Engine (`lib/services/EntitlementService.ts` & `lib/billing/entitlements.ts`)**:
   - Server-authoritative pure evaluation function:
     - Active subscriptions grant Pro entitlements.
     - Subscriptions canceled with `cancelAtPeriodEnd = true` maintain Pro entitlements until `currentPeriodEnd` (grace period).
     - Past due, unpaid, or expired subscriptions fall back cleanly to Free entitlements.
   - Feature flags include:
     - `canUseProFeatures`: Master toggle for Pro tier.
     - `canUseVaultPremiumFeatures`: Advanced biometric / secure vault operations.
     - `canUseAdvancedCalendarFeatures`: External multi-calendar sync, extended range analysis.
     - `canUseAdvancedJournalFeatures`: Rich PDF/Markdown exports, deep reflection analytics.
     - `vaultMaxFiles`: 10 for Free, 10,000 (unlimited) for Pro.

---

## 2. Introductory First-Month Pricing (₹29)

### Promotional Mechanics
- **First Month**: ₹29 (billed once at checkout).
- **Subsequent Months**: Automatically steps up to the standard ₹99/month rate.
- **Server-Side Enforcement**:
  - The eligibility decision is computed strictly server-side by `BillingService.isEligibleForIntroductoryOffer(userId)`.
  - Eligibility requires:
    1. `BillingCustomer.hasUsedIntroductoryOffer === false` (or no customer record yet).
    2. No existing active/past-due subscriptions for the user.
    3. No completed payments under `PRO_MONTHLY` where the introductory price was charged.
  - The client cannot request or force introductory pricing if ineligible; requests will throw `IntroductoryOfferIneligibleError` (code: `INTRO_OFFER_ALREADY_USED`).
  - Canceling and re-subscribing does NOT reset eligibility.

---

## 3. Webhook Handling & Idempotency

### Webhook Endpoint: `/api/webhooks/razorpay`

1. **Raw Body Reading**: Next.js route handler reads `req.text()` directly to preserve exact request bytes for cryptographic HMAC validation.
2. **Signature Verification**: Verified against `process.env.RAZORPAY_WEBHOOK_SECRET` using timing-safe comparisons to prevent timing attacks.
3. **Idempotency Guard**:
   - Checks `db.billingWebhookEvent.findUnique({ where: { provider_providerEventId } })`.
   - If an event has already been recorded and processed, it immediately responds `200 OK` with `{ status: 'already_processed' }`.
   - If the event exists but failed, it can be safely re-attempted.
4. **Normalized Event Handlers**:
   - `subscription.activated`: Activates subscription, sets `currentPeriodStart`/`currentPeriodEnd`, marks `hasUsedIntroductoryOffer = true` if applicable.
   - `subscription.charged` / `payment.captured`: Creates or updates `Payment` record with status `succeeded`, refreshes subscription period dates.
   - `subscription.cancelled`: Sets `status = 'canceled'`, records `canceledAt`. Respects `cancelAtPeriodEnd` flag if period has not yet expired.
   - `payment.failed`: Records failed payment attempt in `Payment` model and transitions subscription to `past_due`.
5. **Audit Logging**: All lifecycle changes generate structured records in `db.auditLog` via `AuditService.log()`.

---

## 4. Environment Configuration

Add the following variables to `.env.local` or production environment settings:

```bash
# ==============================================================================
# Billing & Payment Gateway (Razorpay)
# ==============================================================================
# Public Key ID (safe to expose to browser client for Razorpay Checkout Modal)
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_..."

# Server-only API Secret (NEVER expose to client)
RAZORPAY_KEY_SECRET="your_razorpay_secret_here"

# Webhook Signing Secret configured in Razorpay Dashboard
RAZORPAY_WEBHOOK_SECRET="your_webhook_secret_here"

# Razorpay Plan IDs (created in Razorpay Dashboard -> Subscriptions -> Plans)
RAZORPAY_PLAN_PRO_MONTHLY="plan_..."
RAZORPAY_PLAN_PRO_ANNUAL="plan_..."
```

---

## 5. Local Development & Testing

### Running the Test Suite
Tracker includes comprehensive test suites covering all billing requirements:

```bash
# Run all billing unit and integration tests
bun test tests/billing-*.test.ts

# Run the complete test suite across all modules
bun test
```

### Testing Webhooks Locally
To test live Razorpay webhooks during local development:

1. Start your local Tracker server:
   ```bash
   bun run dev
   ```
2. In a separate terminal, expose your local port (e.g. 3000) using ngrok or Cloudflare Tunnels:
   ```bash
   ngrok http 3000
   ```
3. In the [Razorpay Test Dashboard](https://dashboard.razorpay.com/app/webhooks), create a webhook:
   - **URL**: `https://<your-ngrok-subdomain>.ngrok.io/api/webhooks/razorpay`
   - **Secret**: Set a development secret matching `RAZORPAY_WEBHOOK_SECRET` in your `.env.local`.
   - **Events to Subscribe**:
     - `subscription.authenticated`
     - `subscription.activated`
     - `subscription.charged`
     - `subscription.completed`
     - `subscription.updated`
     - `subscription.cancelled`
     - `payment.captured`
     - `payment.failed`

---

## 6. Razorpay Production Deployment Checklist

Before enabling live billing in production, complete the following mandatory manual steps:

- [ ] **KYC & Account Activation**: Complete business KYC, bank verification, and account activation on Razorpay.
- [ ] **Switch to Live Keys**: Replace test keys with live `rzp_live_...` credentials in production environment variables.
- [ ] **Create Live Subscription Plans**:
  - Plan 1 (Monthly): Period: Monthly, Interval: 1, Amount: ₹99.00 (`9900` paise).
  - Plan 2 (Annual): Period: Yearly, Interval: 1, Amount: ₹799.00 (`79900` paise).
  - Configure `RAZORPAY_PLAN_PRO_MONTHLY` and `RAZORPAY_PLAN_PRO_ANNUAL` with the generated plan IDs.
- [ ] **Configure Production Webhook**:
  - Add production endpoint: `https://<your-domain>/api/webhooks/razorpay`.
  - Copy generated webhook secret to `RAZORPAY_WEBHOOK_SECRET`.
  - Subscribe to subscription and payment lifecycle events.
- [ ] **Run End-to-End Test Transaction**:
  - Execute a live checkout using a live UPI or card instrument, verify webhook delivery in the Razorpay dashboard, and confirm Pro status unlocks immediately.
