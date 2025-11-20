-- Deprecated migration: superseded by 20251021113000_add_collect_table
-- Intentionally left as a no-op to avoid shadow DB failures when applying migrations out of order.
-- This file previously attempted to alter/replace constraints on a table that may not exist yet.
-- Safe guard: only adjust column precision if the table already exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'Collect'
  ) THEN
    -- Optional: normalize createdAt precision; skip if incompatible
    BEGIN
      ALTER TABLE "public"."Collect" ALTER COLUMN "createdAt" TYPE TIMESTAMP(3);
    EXCEPTION WHEN others THEN
      -- ignore precision change errors in shadow/apply phases
    END;
  END IF;
END $$;
