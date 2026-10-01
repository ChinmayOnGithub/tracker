-- Preserve the existing minute-based value for legacy records while introducing
-- an exact second-based canonical duration for Work Tracker sessions.
ALTER TABLE "WorkSession"
  ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER NOT NULL DEFAULT 0;

UPDATE "WorkSession"
SET "durationSeconds" = "durationMinutes" * 60
WHERE "durationSeconds" = 0 AND "durationMinutes" <> 0;
