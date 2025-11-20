-- Create Collect table for user favorites (goods only)
CREATE TABLE IF NOT EXISTS "Collect" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "itemId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "Collect_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Unique constraint to prevent duplicate favorites
CREATE UNIQUE INDEX IF NOT EXISTS "Collect_userId_itemId_key" ON "Collect" ("userId", "itemId");

-- Index for efficient listing by user and time
CREATE INDEX IF NOT EXISTS "Collect_userId_createdAt_idx" ON "Collect" ("userId", "createdAt");