-- Create user_events table to store personalized reminders
CREATE TABLE IF NOT EXISTS "user_events" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "targetName" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT 'custom',
  "eventDate" TIMESTAMPTZ NOT NULL,
  "remindBeforeDays" INTEGER NOT NULL DEFAULT 7,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "user_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
);

-- Efficient queries by user & next event date
CREATE INDEX IF NOT EXISTS "user_events_userId_eventDate_idx"
  ON "user_events" ("userId", "eventDate");

