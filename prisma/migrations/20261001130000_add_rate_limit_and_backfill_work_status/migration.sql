-- CreateTable RateLimit
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- Historical WorkSession Status Data Migration
-- Step 1: Existing completed sessions (endedAt IS NOT NULL) -> COMPLETED
UPDATE "WorkSession"
SET "status" = 'COMPLETED'
WHERE "endedAt" IS NOT NULL;

-- Step 2: Where a linked ActivityLog clearly contains sessionState == 'paused', restore PAUSED
UPDATE "WorkSession" ws
SET "status" = 'PAUSED'
FROM "ActivityLog" al
WHERE al."workSessionId" = ws."id"
  AND (
    al."payload"->>'sessionState' = 'paused'
    OR al."payload"->>'sessionState' = 'PAUSED'
  );

-- Step 3: Sessions with endedAt IS NULL and not paused -> ACTIVE
UPDATE "WorkSession" ws
SET "status" = 'ACTIVE'
WHERE ws."endedAt" IS NULL
  AND ws."status" != 'PAUSED';
