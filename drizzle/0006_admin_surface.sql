-- Ticket 01 (admin surface cutover): better-auth admin plugin columns plus
-- Expense ownership as a real FK. DDL matches the admin plugin schema shipped
-- in better-auth 1.7.1 (verified against the plugin's schema.ts — the CLI
-- generator lags the lib); hand-written per the established pattern.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" timestamptz;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "impersonatedBy" text;
--> statement-breakpoint
-- Expense ownership becomes a real FK (debt recorded in the migration spec:
-- user_id was plain text). Orphans left by 0004's legacy-table drops go first,
-- then cascade delete makes "delete a User deletes their Expenses" a
-- database-level guarantee regardless of code path.
DELETE FROM "expenses" WHERE "user_id" NOT IN (SELECT "id" FROM "user");
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE;
