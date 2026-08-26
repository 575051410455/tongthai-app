import {
  index,
  integer,
  jsonb,
  pgTable,
  bigserial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// The auth tables themselves (user/session/account/verification) are owned
// by better-auth over the pg driver (ADR 0001) and are deliberately NOT
// modeled here. Only the operational tables shared with the rest of the app
// remain in Drizzle.

// Fixed-window counters for RATE_LIMIT_BACKEND=postgres (multi-instance safe)
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start").notNull(),
  count: integer("count").notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    ip: text("ip"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => {
    return {
      userIdIndex: index("audit_logs_user_id_idx").on(table.userId),
    };
  }
);
