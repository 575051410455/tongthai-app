import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import app from "./app";
import { db } from "./db";
import { createAuth } from "./lib/auth";

/**
 * Ticket 07 negative-path tests: throttling (both rate-limit storages),
 * origin check on unsafe non-auth requests, closed registration, and the
 * audit trail (whose observable artifact IS the audit_logs table).
 */

const RUN = `hardening-e2e-${Date.now()}`;
const EMAIL_1 = `${RUN}-1@example.com`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3000";

const TIMEOUT = 120_000;

afterAll(async () => {
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${RUN + "-%"}`);
  await db.execute(sql`DELETE FROM "rateLimit"`);
});

function mountAuth(auth: ReturnType<typeof createAuth>) {
  return new Hono().on(["GET", "POST"], "/api/auth/*", (c) =>
    auth.handler(c.req.raw)
  );
}

async function hammerSignIn(target: Hono, times: number): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < times; i++) {
    const res = await target.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        email: `${RUN}-nobody@example.com`,
        password: "wrong-password-1",
      }),
    });
    statuses.push(res.status);
  }
  return statuses;
}

describe("hardening and audit parity (ticket 07)", () => {
  test(
    "hammering sign-in gets throttled (memory storage)",
    async () => {
      const strict = mountAuth(
        createAuth({ rateLimit: { enabled: true, window: 60, max: 3 } })
      );
      const statuses = await hammerSignIn(strict, 5);
      expect(statuses.slice(0, 3).every((s) => s === 401)).toBe(true);
      expect(statuses[3]).toBe(429);
      expect(statuses[4]).toBe(429);
    },
    TIMEOUT
  );

  test(
    "hammering sign-in gets throttled (database storage)",
    async () => {
      const strict = mountAuth(
        createAuth({
          rateLimit: { enabled: true, window: 60, max: 3, storage: "database" },
        })
      );
      const statuses = await hammerSignIn(strict, 5);
      expect(statuses.slice(0, 3).every((s) => s === 401)).toBe(true);
      expect(statuses[3]).toBe(429);
      expect(statuses[4]).toBe(429);
    },
    TIMEOUT
  );

  test(
    "an unsafe expense request from a foreign origin is rejected; same-origin passes",
    async () => {
      const foreign = await app.request("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({
          title: "CSRF attempt",
          amount: "1.00",
          date: "2026-08-26",
        }),
      });
      expect(foreign.status).toBe(403);
      const body = (await foreign.json()) as { code: string };
      expect(body.code).toBe("ORIGIN_FORBIDDEN");

      // Same-origin gets past the origin check (and then fails auth, not CSRF)
      const sameOrigin = await app.request("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({
          title: "No session",
          amount: "1.00",
          date: "2026-08-26",
        }),
      });
      expect(sameOrigin.status).toBe(401);
    },
    TIMEOUT
  );

  test(
    "sign-up while the registration toggle is off is rejected safely",
    async () => {
      const closed = mountAuth(createAuth({ allowRegistration: false }));
      const res = await closed.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({
          email: `${RUN}-closed@example.com`,
          password: PASSWORD,
          name: "Nope",
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    },
    TIMEOUT
  );

  test(
    "sign-in and session-revocation events land in the audit log",
    async () => {
      const signUp = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({
          email: EMAIL_1,
          password: PASSWORD,
          name: "Audited",
        }),
      });
      expect(signUp.status).toBe(200);
      const cookie = signUp.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");

      const session = await app.request("/api/auth/get-session", {
        headers: { Cookie: cookie },
      });
      const { user } = (await session.json()) as { user: { id: string } };

      const revoke = await app.request("/api/auth/revoke-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: ORIGIN,
        },
        body: JSON.stringify({}),
      });
      expect(revoke.status).toBe(200);

      const rows = (await db.execute(
        sql`SELECT action FROM audit_logs WHERE user_id = ${user.id}`
      )) as unknown as { action: string }[];
      const actions = rows.map((r) => r.action);
      expect(actions).toContain("register");
      expect(actions).toContain("logout_all");

      await db.execute(sql`DELETE FROM audit_logs WHERE user_id = ${user.id}`);
    },
    TIMEOUT
  );
});
