# ADR-007: Provider-Neutral Billing & Subscription Foundation

* **Status**: Approved
* **Date**: 2026-09-19
* **Authors**: Antigravity

---

## Context

Tracker is evolving into a sustainable personal productivity platform requiring a monetizable MVP. The application needed a production-grade billing and subscription system to support Free and Pro subscriptions, introductory promotional pricing (₹29 for the first month, then ₹99/month), annual plans (₹799/year), server-authoritative entitlements, and webhook-driven subscription lifecycle management.

Key challenges and requirements included:
1. **Provider Independence**: Razorpay was chosen as the initial provider, but the core domain must never depend directly on provider-specific types or SDKs so alternate payment processors (e.g. Stripe, LemonSqueezy) can be swapped in without domain rewrites.
2. **Security & Zero Trust**: Client-side reports of payment success or plan IDs must never grant Pro access. All entitlements must be calculated server-side from authoritative database state updated via cryptographically verified webhooks.
3. **Database Integrity & Soft Deletion**: In accordance with the Tracker AI Constitution, billing tables (`BillingCustomer`, `Subscription`, `Payment`, `BillingWebhookEvent`) must support soft deletion (`deletedAt`) and be protected against hard or unscoped deletes.
4. **Idempotency**: Webhooks may be delivered out-of-order, delayed, or replayed. The system must process events exactly once and handle duplicate payloads safely.
5. **Abuse Prevention**: The ₹29 introductory pricing offer must be strictly limited to once-per-account and non-renewable after cancellation or plan changes.

## Decision

We designed and implemented a layered, provider-neutral billing architecture:

1. **Provider Abstraction Layer (`lib/billing/`)**:
   - Defined `IBillingProvider` interface specifying customer management, checkout preparation, subscription retrieval/cancellation, and webhook signature verification + payload normalization.
   - Implemented `RazorpayProvider` encapsulating the official Razorpay SDK (`razorpay@2.9.8`), using timing-safe HMAC SHA-256 verification and mapping Razorpay events (`subscription.activated`, `subscription.charged`, `subscription.cancelled`, `payment.failed`, etc.) to canonical `BillingWebhookEventPayload` domain events.
   - Centralized canonical plan configurations (`FREE`, `PRO_MONTHLY`, `PRO_ANNUAL`) in `lib/billing/plans.ts`.

2. **Durable Database Models (`prisma/schema.prisma`)**:
   - `BillingCustomer`: Links internal `User` to external provider customer records; tracks `hasUsedIntroductoryOffer`.
   - `Subscription`: Stores application-level lifecycle state (`status`, `billingInterval`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `canceledAt`).
   - `Payment`: Durable ledger of payments for billing history and auditability.
   - `BillingWebhookEvent`: Deduplication and idempotency log storing `provider`, `providerEventId`, payload, and processing timestamps.
   - Added all four models to `SOFT_DELETABLE_MODELS` in `lib/db.ts` to prevent hard deletion at runtime.

3. **Domain Services Layer (`lib/services/`)**:
   - `BillingService`: Coordinates checkout initialization, server-side introductory eligibility checks, cancel-at-period-end execution, billing history queries, and idempotent webhook processing with audit logs via `AuditService`.
   - `EntitlementService`: Server-authoritative capability checker computing feature flags (`canUseProFeatures`, `canUseVaultPremiumFeatures`, `canUseAdvancedJournalFeatures`, `vaultMaxFiles`) based on active subscriptions or valid grace periods.

4. **Public Interface & Feature Gating**:
   - Server Actions in `app/actions/billing.ts` validating session user authorization.
   - Dedicated webhook route at `/api/webhooks/razorpay` validating signatures on raw request bytes.
   - Pricing page at `/pricing` and Settings subpanel under Settings -> Billing tab (`/settings?tab=billing`).
   - Authorization guard `requireEntitlement()` in `lib/auth-guards.ts`.

## Consequences

### Pros
* **Complete Provider Isolation**: The rest of Tracker never imports the Razorpay SDK or touches raw provider credentials. Adding Stripe in the future only requires adding `StripeProvider : IBillingProvider`.
* **Server-Authoritative Security**: Impossible for clients to spoof Pro access, forge plan IDs, tamper with amounts, or abuse introductory pricing.
* **Resilient Webhook Pipeline**: Duplicate or replayed webhooks are caught at the database level via `provider_providerEventId` uniqueness and transaction boundaries.
* **Consistent UX**: Styled strictly with Tracker's Design System components (`Button`, `Card`, `Input`) and CSS design tokens, offering a seamless native experience.

### Cons
* **Provider Plan Setup Required**: Subscription plan IDs (`RAZORPAY_PLAN_PRO_MONTHLY`, `RAZORPAY_PLAN_PRO_ANNUAL`) and webhook secrets must be provisioned in the Razorpay dashboard before live transactions can execute.
* **Webhook Dependency**: Subscription activation depends on webhook receipt (or synchronous checkout confirmation), requiring reliable network delivery or local webhook tunneling (e.g. ngrok) during local development.
