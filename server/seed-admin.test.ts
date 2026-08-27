import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import app from "./app";
import { db } from "./db";

/**
 * First-admin seed (ticket 02), tested at the script's real seam: a spawned
 * `bun seed-admin.ts` process against the real Postgres, then the resulting
 * account exercised over HTTP.
 */

const RUN = `seed-e2e-${Date.now()}`;
const EMAIL_FRESH = `${RUN}-fresh@example.com`;
const EMAIL_EXISTING = `${RUN}-existing@example.com`;
const PASSWORD = "seed-horse-battery";
const ORIGIN = "http://localhost:3000";

const TIMEOUT = 60_000;

afterAll(async () => {
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${RUN + "-%"})`
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${RUN + "-%"}`);
});

async function runSeed(email: string, password: string) {
  const proc = Bun.spawn(["bun", "seed-admin.ts"], {
    cwd: `${import.meta.dir}/..`,
    env: {
      ...process.env,
      SEED_ADMIN_EMAIL: email,
      SEED_ADMIN_PASSWORD: password,
      SEED_ADMIN_NAME: "Seeded Admin",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  return { exitCode, out, err };
}

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signIn(email: string, password: string): Promise<Response> {
  return app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
}

describe("first-admin seed (ticket 02)", () => {
  test(
    "a fresh instance gets a working, verified Admin in one command",
    async () => {
      const { exitCode, err } = await runSeed(EMAIL_FRESH, PASSWORD);
      expect(err).toBe("");
      expect(exitCode).toBe(0);

      const res = await signIn(EMAIL_FRESH, PASSWORD);
      expect(res.status).toBe(200);
      const cookie = cookiesFrom(res);

      const list = await app.request("/api/auth/admin/list-users?limit=1", {
        headers: { Cookie: cookie },
      });
      expect(list.status).toBe(200);

      const session = await app.request("/api/auth/get-session", {
        headers: { Cookie: cookie },
      });
      const body = (await session.json()) as {
        user: { role: string; emailVerified: boolean };
      };
      expect(body.user.role).toBe("admin");
      expect(body.user.emailVerified).toBe(true);
    },
    TIMEOUT
  );

  test(
    "running the seed twice changes nothing (idempotent)",
    async () => {
      const { exitCode, out } = await runSeed(EMAIL_FRESH, PASSWORD);
      expect(exitCode).toBe(0);
      expect(out).toContain("already an Admin");

      const rows = (await db.execute(
        sql`SELECT id FROM "user" WHERE email = ${EMAIL_FRESH}`
      )) as unknown as unknown[];
      expect(rows).toHaveLength(1);
    },
    TIMEOUT
  );

  test(
    "seeding an existing regular account promotes it, keeping its password",
    async () => {
      const signUp = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({
          email: EMAIL_EXISTING,
          password: PASSWORD,
          name: "Existing User",
        }),
      });
      expect(signUp.status).toBe(200);

      const { exitCode, out } = await runSeed(EMAIL_EXISTING, "ignored-password");
      expect(exitCode).toBe(0);
      expect(out).toContain("promoted");

      // original password still works, and the account is now an Admin
      const res = await signIn(EMAIL_EXISTING, PASSWORD);
      expect(res.status).toBe(200);
      const session = await app.request("/api/auth/get-session", {
        headers: { Cookie: cookiesFrom(res) },
      });
      const body = (await session.json()) as { user: { role: string } };
      expect(body.user.role).toBe("admin");
    },
    TIMEOUT
  );

  test(
    "missing or short credentials fail fast without touching the database",
    async () => {
      const missing = await runSeed("", PASSWORD);
      expect(missing.exitCode).toBe(1);
      const short = await runSeed(`${RUN}-short@example.com`, "short");
      expect(short.exitCode).toBe(1);
      const rows = (await db.execute(
        sql`SELECT id FROM "user" WHERE email = ${RUN + "-short@example.com"}`
      )) as unknown as unknown[];
      expect(rows).toHaveLength(0);
    },
    TIMEOUT
  );
});
