-- Ticket 07 (hardening/audit parity):
-- 1. better-auth database-backed rate limiting table (DDL from the runtime's
--    own getMigrations(), hand-written per the established pattern).
-- 2. audit_logs.user_id was uuid (Tongthai era); better-auth user ids are
--    text, so widen the column. Existing rows cast losslessly.
CREATE TABLE IF NOT EXISTS "rateLimit" (
	"id" text NOT NULL PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
