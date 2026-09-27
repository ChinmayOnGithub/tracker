-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable ActivityTemplate
ALTER TABLE "ActivityTemplate" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable ActivityLog
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable Note
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable CalendarSyncState
ALTER TABLE "CalendarSyncState" ADD COLUMN IF NOT EXISTS "syncLockUntil" TIMESTAMP(3);
ALTER TABLE "CalendarSyncState" ADD COLUMN IF NOT EXISTS "syncLockToken" TEXT;

-- CreateTable SyncOperation
CREATE TABLE IF NOT EXISTS "SyncOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable SyncCursor
CREATE TABLE IF NOT EXISTS "SyncCursor" (
    "userId" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("userId")
);

-- CreateTable RateLimit
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SyncOperation_userId_clientRequestId_key" ON "SyncOperation"("userId", "clientRequestId");
CREATE INDEX IF NOT EXISTS "SyncOperation_userId_createdAt_idx" ON "SyncOperation"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SyncOperation_userId_fkey'
    ) THEN
        ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SyncCursor_userId_fkey'
    ) THEN
        ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
