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

## 2. Introductory First-Month Pricing (₹29 ➔ ₹99/month)

### Verified Official Razorpay Mechanism
- **The Core Constraint**: Razorpay Plans define the baseline recurring price. A plan cannot have arbitrary multiple rates in its own entity.
- **The Solution (Razorpay Subscription Offers)**:
  - Plan `PRO_MONTHLY` is created on Razorpay for ₹99.00 (`9900` paise), interval: 1, period: monthly.
  - A promotional offer is created in the Razorpay Dashboard (**Subscriptions** > **Offers**):
    - **Discount Type**: Flat discount of **₹70.00** (`7000` paise).
    - **Redemption Type**: Single Use / Limited number of cycles (`1`).
    - **Applicable Plan**: Linked to `PRO_MONTHLY`.
  - When Tracker initiates checkout via `POST /v1/subscriptions`, it passes `"offer_id": process.env.RAZORPAY_OFFER_INTRODUCTORY`.
  - **First Cycle Charge**: ₹99 - ₹70 = **₹29**.
  - **Subsequent Renewals**: Because the offer expired after cycle 1, Razorpay automatically charges the baseline recurring plan price: **₹99/month**.
  - **Paise Conversion**: All amounts from Razorpay webhook/payment entities are reported in paise (e.g. `2900`, `9900`, `79900`) and divided by 100 on the server. The database strictly stores the authoritative amount charged.

### Concurrency & Once-Per-Account Invariant
- **Atomic Reservation**: To prevent race conditions from concurrent checkout requests (e.g. user opening two tabs simultaneously), `BillingService.startSubscription` uses an atomic conditional update on the `BillingCustomer` record (`hasUsedIntroductoryOffer: false` ➔ `true`). Only the winning request receives `isIntroductory: true`.
- **Transient Failure Rollback**: If Razorpay API call fails during subscription creation, the reservation is rolled back in the error handler so the user is not penalized for gateway downtime.
- **Permanent Ineligibility**: Once an introductory subscription is created, cancellation, payment failure, retries, plan switching, or browser reload will never grant the introductory rate again.

---

## 3. Webhook Handling, Security & Idempotency

### Webhook Endpoint: `/api/webhooks/razorpay`

1. **Raw Body Reading**: The route handler reads `req.text()` directly without JSON re-serialization to preserve byte-exact signatures.
2. **Signature Verification**: Verified against `process.env.RAZORPAY_WEBHOOK_SECRET` using `crypto.timingSafeEqual` over HMAC SHA-256 digests.
3. **Idempotency Guard**:
   - Checks `db.billingWebhookEvent.findUnique({ where: { provider_providerEventId } })`.
   - If an event is already marked `PROCESSED`, returns `200 OK` immediately without repeating ledger or entitlement mutations.
4. **Authoritative Payment Recording**:
   - `Payment.amount` is extracted directly from `payload.payment.entity.amount / 100`.
   - Tracker never assumes or hardcodes payment amounts. If an event lacks payment data, it queries `provider.retrievePayment()` or fails safely.

### Webhook Lifecycle State Table
| Razorpay Event | Tracker Subscription Status | Entitlement State | Financial Ledger Effect |
| :--- | :--- | :--- | :--- |
| `subscription.activated` | `ACTIVE` | `PRO` | Updates period start and end dates. Locks intro offer permanently. |
| `subscription.charged` | `ACTIVE` | `PRO` | Creates/updates `Payment` record with actual verified amount (₹29, ₹99, or ₹799). |
| `subscription.pending` | `PENDING` | Grace period if `currentPeriodEnd > now`, else `CHECKOUT_PENDING` / `FREE` | Retries underway on payment gateway. |
| `subscription.halted` | `HALTED` | `PAST_DUE` ➔ `FREE` | Automatic retries exhausted. Requires customer intervention. |
| `subscription.cancelled` | `CANCELLED` | `CANCEL_AT_PERIOD_END` until `currentPeriodEnd`, then `FREE` | Preserves paid access through period end. Disables auto-renewal. |
| `payment.failed` | Unchanged / `PENDING` | Unchanged (does NOT grant Pro) | Records `Payment` with status `FAILED`. |

---

## 4. Environment Variables Specification

All variables must be configured in `.env.local` (or production environment variables):

```bash
# ==============================================================================
# Tracker Billing — Razorpay Production Configuration
# ==============================================================================

# Public Key ID — Safe to expose to browser for Razorpay Checkout Modal
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_..."

# Server-Only API Secret — NEVER expose to browser or client props
RAZORPAY_KEY_SECRET="your_razorpay_api_secret"

# Webhook Secret — Configured in Razorpay Dashboard for webhook signature validation
RAZORPAY_WEBHOOK_SECRET="your_webhook_signing_secret"

# Plan IDs — Created under Razorpay Dashboard > Subscriptions > Plans
RAZORPAY_PLAN_PRO_MONTHLY="plan_..."   # ₹99/month (9900 paise)
RAZORPAY_PLAN_PRO_ANNUAL="plan_..."    # ₹799/year (79900 paise)

# Introductory Offer ID — Created under Razorpay Dashboard > Subscriptions > Offers
RAZORPAY_OFFER_INTRODUCTORY="offer_..." # Flat ₹70 discount for 1 cycle on PRO_MONTHLY
```

---

## 5. Razorpay Dashboard Setup Instructions

Complete these steps in the [Razorpay Dashboard](https://dashboard.razorpay.com/):

### 1. Create Monthly Plan
- Navigate to: **Subscriptions** ➔ **Plans** ➔ **+ Create Plan**
- **Plan Name**: `Tracker Pro Monthly`
- **Plan Description**: `Tracker Pro Monthly Subscription`
- **Billing Frequency**: `Monthly`
- **Billing Interval**: `1`
- **Amount**: `₹99.00`
- Copy the generated `plan_...` ID to `RAZORPAY_PLAN_PRO_MONTHLY`.

### 2. Create Annual Plan
- Navigate to: **Subscriptions** ➔ **Plans** ➔ **+ Create Plan**
- **Plan Name**: `Tracker Pro Annual`
- **Plan Description**: `Tracker Pro Annual Subscription (Save 33%)`
- **Billing Frequency**: `Yearly`
- **Billing Interval**: `1`
- **Amount**: `₹799.00`
- Copy the generated `plan_...` ID to `RAZORPAY_PLAN_PRO_ANNUAL`.

### 3. Create Introductory Offer (for ₹29 First Month)
- Navigate to: **Subscriptions** ➔ **Offers** ➔ **+ Create New Offer**
- **Offer Name**: `Tracker Pro First Month Intro`
- **Discount Type**: `Flat`
- **Discount Amount**: `₹70.00`
- **Redemption Type**: `Limited number of cycles` = `1` (or `Single Use`)
- **Applicable Plans**: Select `Tracker Pro Monthly`
- Copy the generated `offer_...` ID to `RAZORPAY_OFFER_INTRODUCTORY`.

### 4. Configure Webhooks
- Navigate to: **Settings** ➔ **Webhooks** ➔ **+ Add New Webhook**
- **Webhook URL**: `https://<your-domain>/api/webhooks/razorpay` (or ngrok URL during local testing)
- **Secret**: Enter a secure random string and set it as `RAZORPAY_WEBHOOK_SECRET`.
- **Active Events to Select**:
  - `subscription.authenticated`
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.pending`
  - `subscription.halted`
  - `subscription.cancelled`
  - `payment.failed`

---

## 6. Integration Status
- **Current Status**: `Razorpay integration in preparation / Test Mode pending`
- **Next Milestone**: Input Razorpay Test Mode credentials, execute real checkout transaction, and verify end-to-end webhook delivery.
