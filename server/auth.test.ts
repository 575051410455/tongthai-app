import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import app from "./app";
import { db } from "./db";

/**
 * Ticket 03 journey tests at the HTTP seam: the whole app via app.request()
 * against the real Postgres (standing rule: never Docker). External behavior
 * only — status codes, cookies, and what a subsequent request can do.
 */

const RUN = `ba-e2e-${Date.now()}`;
const EMAIL_1 = `${RUN}-1@example.com`;
const EMAIL_2 = `${RUN}-2@example.com`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3000";

const TIMEOUT = 60_000; // remote DB over DDNS is slow/flaky

afterAll(async () => {
  // user cascade deletes session + account rows; expenses key by user id text
  await db.execute(
    sql`DELETE FROM expenses WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${RUN + "-%"})`
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${RUN + "-%"}`);
});

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signUp(email: string, name: string): Promise<string> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD, name }),
  });
  expect(res.status).toBe(200);
  const cookie = cookiesFrom(res);
  expect(cookie).toContain("tt.session_token=");
  return cookie;
}

describe("better-auth core cutover (ticket 03)", () => {
  let cookie1: string;
  let cookie2: string;

  test(
    "a new user can sign up and gets a tt-prefixed session cookie",
    async () => {
      cookie1 = await signUp(EMAIL_1, "First User");
    },
    TIMEOUT
  );

  test(
    "the session survives a simulated reload (cookie-bearing get-session)",
    async () => {
      const res = await app.request("/api/auth/get-session", {
        headers: { Cookie: cookie1 },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        user: { email: string; role: string; emailVerified: boolean };
      };
      expect(body.user.email).toBe(EMAIL_1);
      expect(body.user.role).toBe("user");
      expect(body.user.emailVerified).toBe(false);
    },
    TIMEOUT
  );

  test(
    "expenses require a session: 401 without a cookie",
    async () => {
      const res = await app.request("/api/expenses");
      expect(res.status).toBe(401);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("UNAUTHORIZED");
    },
    TIMEOUT
  );

  test(
    "a signed-in user can create and list their own expenses",
    async () => {
      const create = await app.request("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie1,
          Origin: ORIGIN,
        },
        body: JSON.stringify({
          title: "Test coffee",
          amount: "3.50",
          date: "2026-08-26",
        }),
      });
      expect(create.status).toBe(201);

      const list = await app.request("/api/expenses", {
        headers: { Cookie: cookie1 },
      });
      expect(list.status).toBe(200);
      const body = (await list.json()) as { expenses: { title: string }[] };
      expect(body.expenses).toHaveLength(1);
      expect(body.expenses[0]!.title).toBe("Test coffee");
    },
    TIMEOUT
  );

  test(
    "expense isolation: a second user sees none of the first user's expenses",
    async () => {
      cookie2 = await signUp(EMAIL_2, "Second User");
      const list = await app.request("/api/expenses", {
        headers: { Cookie: cookie2 },
      });
      expect(list.status).toBe(200);
      const body = (await list.json()) as { expenses: unknown[] };
      expect(body.expenses).toHaveLength(0);
    },
    TIMEOUT
  );

  test(
    "sign-in failures reveal nothing about account existence",
    async () => {
      const wrongPassword = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ email: EMAIL_1, password: "wrong-password-1" }),
      });
      const noSuchUser = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({
          email: `${RUN}-nobody@example.com`,
          password: "wrong-password-1",
        }),
      });
      expect(wrongPassword.status).toBe(401);
      expect(noSuchUser.status).toBe(401);
      const a = (await wrongPassword.json()) as { code?: string };
      const b = (await noSuchUser.json()) as { code?: string };
      expect(a.code ?? "").toBe(b.code ?? "");
    },
    TIMEOUT
  );

  test(
    "sign-up with a taken email fails distinctly",
    async () => {
      const res = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({
          email: EMAIL_1,
          password: PASSWORD,
          name: "Duplicate",
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    },
    TIMEOUT
  );

  test(
    "sign-out kills the session",
    async () => {
      const out = await app.request("/api/auth/sign-out", {
        method: "POST",
        headers: { Cookie: cookie2, Origin: ORIGIN },
      });
      expect(out.status).toBe(200);

      // The old cookie no longer authenticates
      const list = await app.request("/api/expenses", {
        headers: { Cookie: cookie2 },
      });
      expect(list.status).toBe(401);
    },
    TIMEOUT
  );

  test(
    "no Tongthai auth endpoint responds anymore",
    async () => {
      for (const path of ["/api/auth/login", "/api/auth/refresh", "/api/auth/me"]) {
        const res = await app.request(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: ORIGIN },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(404);
      }
    },
    TIMEOUT
  );
});
