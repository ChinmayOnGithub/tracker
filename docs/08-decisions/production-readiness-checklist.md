# Production Deployment Readiness Checklist (#32)

## 1. Environment & Secrets Management
* [x] **Secret Isolation**: Production uses dedicated, high-entropy secrets (`AUTH_SECRET`, `GOOGLE_OAUTH_ENCRYPTION_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`). No development/test values permitted.
* [x] **Domain & Callback URLs**:
  * Production domain: Configured with enforced HTTPS.
  * Google OAuth Redirect: `https://<DOMAIN>/api/auth/callback/google`.
  * Razorpay Webhook URL: `https://<DOMAIN>/api/billing/webhook`.
* [x] **Live Billing Enforcement**: `RAZORPAY_ENFORCE_LIVE=true` in production to prevent test-mode keys (`rzp_test_`) from executing paid transactions.

---

## 2. Database & Data Safety
* [x] **Database Isolation**: Production database (`DATABASE_URL`, `DIRECT_URL`) completely isolated from test/dev databases.
* [x] **Prisma Interceptors & Safety Safeguards**: Hard deletes prohibited on soft-deletable models (`deletedAt`); unscoped `deleteMany()` queries blocked at runtime by interceptors in `lib/db.ts`.
* [x] **Backup Strategy**: Continuous automated WAL archiving and daily full snapshots on Postgres provider (Supabase/Neon).
* [x] **Safe Migrations**: `prisma migrate deploy` run during deployment pipelines. Destructive resets (`prisma db push --force-reset`) strictly forbidden.

---

## 3. Reliability & Monitoring
* [x] **Health Check Probe**: Automated `/api/health` endpoint returning HTTP 200/503 with database connectivity and latency reporting.
* [x] **Structured Logging**: Centralized logger (`lib/logger.ts`) emitting JSON-compatible structured log lines with trace IDs and metadata.
* [x] **Fail-Closed Entitlements**: If billing provider or subscription status is ambiguous, the system defaults to Free tier rather than risking unauthorized access.
* [x] **Login Rate Limiting**: Built-in rate limiting (`CredentialService.checkRateLimit`) blocking brute-force attempts after 5 failures with 5-minute cooldown.

---

## 4. Security & Account Isolation
* [x] **Cross-Account Session Isolation (#57)**: User-scoped storage keys in client (`userStorage.ts`), automatic purge on logout, request deduplicator reset, and store re-initialization.
* [x] **Authoritative Server Authorization**: Free users strictly blocked from Pro Server Actions and APIs (Vault upload 10-file cap, Advanced Calendar sync, etc.). Client cannot bypass via localStorage or component manipulation.
* [x] **Webhook Signature Verification**: HMAC-SHA256 signature checked against raw request body before processing Razorpay webhooks.

---

## 5. Deployment & Rollback Strategy
* [x] **Zero-Downtime Deployment**: Blue-green or rolling deploys using Next.js standalone container/server.
* [x] **Failed Deployment Behavior**: CI checks (`bun test`, `bun run lint`, `bunx tsc --noEmit`, `bun run build`) gate merge to `main`.
* [x] **Rollback Procedure**: Revert commit and redeploy prior immutable artifact. Non-destructive DB migration strategy ensures schema backward-compatibility.
