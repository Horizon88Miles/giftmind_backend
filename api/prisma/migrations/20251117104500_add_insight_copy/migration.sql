-- Create insight_copy table for daily quotes
CREATE TABLE IF NOT EXISTS "insight_copy" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "text" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'system',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "weight" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "insight_copy_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "insight_copy_isActive_updatedAt_idx"
  ON "insight_copy" ("isActive", "updatedAt");

-- Seed 10 default copies (<=25 chars each)
INSERT INTO "insight_copy" ("text", "source", "tags")
VALUES
  ('把心意折成温柔礼物', 'seed', ARRAY['reminder']),
  ('提前准备惊喜更安心', 'seed', ARRAY['plan']),
  ('礼物要合适更要真诚', 'seed', ARRAY['gift']),
  ('记下重要的日子吧', 'seed', ARRAY['calendar']),
  ('贴心提醒来自懂你', 'seed', ARRAY['care']),
  ('礼物灵感随手记录', 'seed', ARRAY['idea']),
  ('把喜欢的人放进日程', 'seed', ARRAY['love']),
  ('礼物需要一点点耐心', 'seed', ARRAY['patience']),
  ('每天给生活加点仪式', 'seed', ARRAY['ritual']),
  ('小礼物也能传递重量', 'seed', ARRAY['warm']);

