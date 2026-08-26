import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import app from "./app";
import { db } from "./db";

/**
 * Ticket 06 journey tests at the HTTP seam: profile name update, change
 * password (confirm current, revoke others), sign out everywhere.
 */

const RUN = `account-e2e-${Date.now()}`;
const EMAIL_1 = `${RUN}-1@example.com`;
const OLD_PASSWORD = "old-password-123";
const NEW_PASSWORD = "new-password-456";
const ORIGIN = "http://localhost:3000";

const TIMEOUT = 60_000;

afterAll(async () => {
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${RUN + "-%"}`);
});

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function json(path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function sessionUser(cookie: string) {
  const res = await app.request("/api/auth/get-session", {
    headers: { Cookie: cookie },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { user: { name: string } } | null;
}

describe("account management (ticket 06)", () => {
  let cookieA: string;
  let cookieB: string;

  test(
    "setup: one user with two concurrent sessions",
    async () => {
      const signUp = await json("/api/auth/sign-up/email", {
        email: EMAIL_1,
        password: OLD_PASSWORD,
        name: "Account User",
      });
      expect(signUp.status).toBe(200);
      cookieA = cookiesFrom(signUp);

      const signIn = await json("/api/auth/sign-in/email", {
        email: EMAIL_1,
        password: OLD_PASSWORD,
      });
      expect(signIn.status).toBe(200);
      cookieB = cookiesFrom(signIn);
    },
    TIMEOUT
  );

  test(
    "change password requires the correct current password",
    async () => {
      const res = await json(
        "/api/auth/change-password",
        {
          currentPassword: "wrong-current-password",
          newPassword: NEW_PASSWORD,
          revokeOtherSessions: true,
        },
        cookieA
      );
      expect(res.status).toBeGreaterThanOrEqual(400);

      // Nothing changed: old password still signs in
      const stillOld = await json("/api/auth/sign-in/email", {
        email: EMAIL_1,
        password: OLD_PASSWORD,
      });
      expect(stillOld.status).toBe(200);
    },
    TIMEOUT
  );

  test(
    "change password with the right current password revokes the other session",
    async () => {
      const res = await json(
        "/api/auth/change-password",
        {
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
          revokeOtherSessions: true,
        },
        cookieA
      );
      expect(res.status).toBe(200);

      // The current session is rotated: the response carries a fresh cookie
      // (browsers pick it up automatically)
      const rotated = cookiesFrom(res);
      expect(rotated).toContain("tt.session_token=");
      cookieA = rotated;

      // The other session died; the (rotated) current one lives
      const otherSession = await app.request("/api/expenses", {
        headers: { Cookie: cookieB },
      });
      expect(otherSession.status).toBe(401);
      expect(await sessionUser(cookieA)).not.toBeNull();

      // Old password is dead, new one works
      const oldTry = await json("/api/auth/sign-in/email", {
        email: EMAIL_1,
        password: OLD_PASSWORD,
      });
      expect(oldTry.status).toBe(401);
      const newTry = await json("/api/auth/sign-in/email", {
        email: EMAIL_1,
        password: NEW_PASSWORD,
      });
      expect(newTry.status).toBe(200);
    },
    TIMEOUT
  );

  test(
    "profile name update persists",
    async () => {
      const res = await json(
        "/api/auth/update-user",
        { name: "Renamed User" },
        cookieA
      );
      expect(res.status).toBe(200);
      expect((await sessionUser(cookieA))?.user.name).toBe("Renamed User");
    },
    TIMEOUT
  );

  test(
    "sign out everywhere kills every session at once",
    async () => {
      const res = await json("/api/auth/revoke-sessions", {}, cookieA);
      expect(res.status).toBe(200);

      const after = await app.request("/api/expenses", {
        headers: { Cookie: cookieA },
      });
      expect(after.status).toBe(401);
    },
    TIMEOUT
  );
});
