import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  bigserial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  // Bumping this instantly invalidates every outstanding access JWT
  tokenVersion: integer("token_version").notNull().default(0),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  // Optional account expiry — blocked at login and re-checked in getUser
  expiresAt: timestamp("expires_at"),
  // Schema-ready for email 2FA (flows not enabled yet — no SMTP configured)
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // sha256 of the secret half — a DB leak never yields usable tokens
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    replacedBy: uuid("replaced_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => {
    return {
      userIdIndex: index("refresh_tokens_user_id_idx").on(table.userId),
    };
  }
);

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
