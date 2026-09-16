-- PRD-000 §7.2: a setting key must never be an empty string.
--
-- Written by hand because schema.prisma cannot express CHECK constraints.
-- Prisma replays this file into its shadow database, so the constraint is part
-- of the expected schema and does not show up as drift.
ALTER TABLE "system_setting"
    ADD CONSTRAINT "system_setting_key_not_empty" CHECK (length(btrim("key")) > 0);
