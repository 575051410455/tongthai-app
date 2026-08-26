import { type MiddlewareHandler } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { rateLimitBuckets } from "../db/schema/auth";
import { authEnv } from "../lib/env";
import { rateLimitKey } from "../lib/client-ip";

/**
 * Fixed-window rate limiting. Backend selected by RATE_LIMIT_BACKEND:
 * `memory` for a single instance (dev default), `postgres` for anything
 * multi-instance. Keys must come from rateLimitKey(c) — never read
 * x-forwarded-for anywhere else.
 */

type Bucket = { windowStart: number; count: number };
const memoryBuckets = new Map<string, Bucket>();

function consumeMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    memoryBuckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// Opportunistic cleanup so the map doesn't grow unbounded
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of memoryBuckets) {
      if (now - bucket.windowStart > 60 * 60 * 1000) memoryBuckets.delete(key);
    }
  },
  10 * 60 * 1000
).unref?.();

async function consumePostgres(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMs);
  const row = await db
    .insert(rateLimitBuckets)
    .values({ key, windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        count: sql`CASE WHEN ${rateLimitBuckets.windowStart} <= ${cutoff} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimitBuckets.windowStart} <= ${cutoff} THEN now() ELSE ${rateLimitBuckets.windowStart} END`,
      },
    })
    .returning({ count: rateLimitBuckets.count })
    .then((res) => res[0]);
  return row.count <= limit;
}

/** Returns true when the request is allowed. */
export async function tryConsume(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  if (authEnv.RATE_LIMIT_BACKEND === "postgres") {
    return consumePostgres(key, limit, windowMs);
  }
  return consumeMemory(key, limit, windowMs);
}

function limiter(
  name: string,
  limit: number,
  windowMs: number
): MiddlewareHandler {
  return async (c, next) => {
    const allowed = await tryConsume(
      `${name}:${rateLimitKey(c)}`,
      limit,
      windowMs
    );
    if (!allowed) {
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }
    return next();
  };
}

/** Whole API surface: coarse safety net. (Auth endpoints additionally get
 * better-auth's own rate limiting — see lib/auth.ts.) */
export const generalLimiter = limiter("general", 300, 60 * 1000);
