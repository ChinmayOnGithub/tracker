ALTER TABLE "WorkSession"
  ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER NOT NULL DEFAULT 0;

UPDATE "WorkSession"
SET "durationSeconds" = "durationMinutes" * 60
WHERE "durationSeconds" = 0 AND "durationMinutes" <> 0;
