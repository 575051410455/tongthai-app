import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import app from "./app";
import { db } from "./db";
import { DevTransport, email } from "./lib/email";

/**
 * Ticket 05 journey tests at the HTTP seam. Reset links come out of the
 * captured emails (the transport fake) — never out of the database.
 */

const transport = email as DevTransport;

const RUN = `reset-e2e-${Date.now()}`;
const EMAIL_1 = `${RUN}-1@example.com`;
const OLD_PASSWORD = "old-password-123";
const NEW_PASSWORD = "new-password-456";
const ORIGIN = "http://localhost:3000";

const TIMEOUT = 60_000;

afterAll(async () => {
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${RUN + "-%"}`);
});

function resetEmailsTo(address: string) {
  return transport.sent.filter(
    (m) => m.to === address && m.subject === "Reset your password"
  );
}

function tokenFromLink(message: { text: string }): string {
  const match = message.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("no link in captured email");
  const url = new URL(match[0]);
  // token is either the last path segment (/reset-password/<token>) or a
  // ?token= query param, depending on link shape
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  return url.pathname.split("/").pop()!;
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

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("password reset (ticket 05)", () => {
  let otherSessionCookie: string;
  let token: string;

  test(
    "requesting a reset captures an email; unknown emails get the identical response",
    async () => {
      const signUpRes = await json("/api/auth/sign-up/email", {
        email: EMAIL_1,
        password: OLD_PASSWORD,
        name: "Reset Me",
      });
      expect(signUpRes.status).toBe(200);
      otherSessionCookie = cookiesFrom(signUpRes);

      const known = await json("/api/auth/request-password-reset", {
        email: EMAIL_1,
        redirectTo: "/reset-password",
      });
      const unknown = await json("/api/auth/request-password-reset", {
        email: `${RUN}-nobody@example.com`,
        redirectTo: "/reset-password",
      });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await known.text()).toBe(await unknown.text());

      expect(resetEmailsTo(EMAIL_1)).toHaveLength(1);
      expect(resetEmailsTo(`${RUN}-nobody@example.com`)).toHaveLength(0);

      token = tokenFromLink(resetEmailsTo(EMAIL_1)[0]!);
      expect(token.length).toBeGreaterThan(10);
    },
    TIMEOUT
  );

  test(
    "completing the reset changes the password and revokes other sessions",
    async () => {
      const res = await json("/api/auth/reset-password", {
        newPassword: NEW_PASSWORD,
        token,
      });
      expect(res.status).toBe(200);

      // Old password is dead, new one signs in
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

      // The session that existed before the reset was revoked
      const expenses = await app.request("/api/expenses", {
        headers: { Cookie: otherSessionCookie },
      });
      expect(expenses.status).toBe(401);
    },
    TIMEOUT
  );

  test(
    "a reset link works only once",
    async () => {
      const reuse = await json("/api/auth/reset-password", {
        newPassword: "another-password-789",
        token,
      });
      expect(reuse.status).toBeGreaterThanOrEqual(400);

      // Password unchanged by the failed reuse
      const stillNew = await json("/api/auth/sign-in/email", {
        email: EMAIL_1,
        password: NEW_PASSWORD,
      });
      expect(stillNew.status).toBe(200);
    },
    TIMEOUT
  );

  test(
    "a tampered reset token is rejected safely",
    async () => {
      const res = await json("/api/auth/reset-password", {
        newPassword: "tampered-password-000",
        token: "tampered-" + token,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    },
    TIMEOUT
  );
});
