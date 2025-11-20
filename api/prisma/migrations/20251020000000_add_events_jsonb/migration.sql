-- Add events JSONB column to Archive table for multi-event support
ALTER TABLE "Archive" ADD COLUMN "events" JSONB;