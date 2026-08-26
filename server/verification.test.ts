import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import app from "./app";
import { db } from "./db";
import { createAuth } from "./lib/auth";
import { DevTransport, email } from "./lib/email";

/**
 * Ticket 04 journey tests at the HTTP seam. Verification links are pulled
 * from the captured emails (the transport fake) — never from the database.
 */

const transport = email as DevTransport;

const RUN = `verify-e2e-${Date.now()}`;
const EMAIL_1 = `${RUN}-1@example.com`;
const EMAIL_2 = `${RUN}-2@example.com`;
const EMAIL_3 = `${RUN}-3@example.com`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3000";

const TIMEOUT = 60_000;

afterAll(async () => {
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${RUN + "-%"}`);
});

function verificationEmailsTo(address: string) {
  return transport.sent.filter(
    (m) => m.to === address && m.subject === "Verify your email"
  );
}

function linkFrom(message: { text: string }): string {
  const match = message.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("no link in captured email");
  return match[0];
}

async function signUp(address: string, name: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email: address, password: PASSWORD, name }),
  });
  expect(res.status).toBe(200);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function sessionUser(cookie: string) {
  const res = await app.request("/api/auth/get-session", {
    headers: { Cookie: cookie },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    user: { email: string; emailVerified: boolean };
  } | null;
}

describe("email verification (ticket 04)", () => {
  test(
    "sign-up captures exactly one verification email through the dev transport",
    async () => {
      await signUp(EMAIL_1, "Verify Me");
      const emails = verificationEmailsTo(EMAIL_1);
      expect(emails).toHaveLength(1);
      expect(linkFrom(emails[0]!)).toContain("/api/auth/verify-email");
    },
    TIMEOUT
  );

  test(
    "following the emailed link flips the user to verified",
    async () => {
      const cookie = await signUp(EMAIL_2, "Link Follower");
      expect((await sessionUser(cookie))?.user.emailVerified).toBe(false);

      const link = linkFrom(verificationEmailsTo(EMAIL_2)[0]!);
      const res = await app.request(link, { method: "GET" });
      // verify-email redirects to the callback URL on success
      expect([200, 302]).toContain(res.status);

      expect((await sessionUser(cookie))?.user.emailVerified).toBe(true);
    },
    TIMEOUT
  );

  test(
    "resend captures a fresh verification email",
    async () => {
      const cookie = await signUp(EMAIL_3, "Resender");
      expect(verificationEmailsTo(EMAIL_3)).toHaveLength(1);

      const res = await app.request("/api/auth/send-verification-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: ORIGIN,
        },
        body: JSON.stringify({ email: EMAIL_3, callbackURL: "/" }),
      });
      expect(res.status).toBe(200);
      expect(verificationEmailsTo(EMAIL_3)).toHaveLength(2);
    },
    TIMEOUT
  );

  test(
    "a tampered verification link is rejected safely",
    async () => {
      const cookie = await signUp(`${RUN}-4@example.com`, "Tampered");
      const link = linkFrom(verificationEmailsTo(`${RUN}-4@example.com`)[0]!);
      const url = new URL(link);
      url.searchParams.set("token", "tampered-" + url.searchParams.get("token"));

      const res = await app.request(url.toString(), { method: "GET" });
      expect(res.status).toBeGreaterThanOrEqual(300); // error page/redirect, never a 2xx success
      expect((await sessionUser(cookie))?.user.emailVerified).toBe(false);
    },
    TIMEOUT
  );

  test(
    "with REQUIRE_EMAIL_VERIFICATION on, sign-in is blocked until verified",
    async () => {
      const strictAuth = createAuth({ requireEmailVerification: true });
      const strictApp = new Hono().on(["GET", "POST"], "/api/auth/*", (c) =>
        strictAuth.handler(c.req.raw)
      );

      const address = `${RUN}-strict@example.com`;
      const signUpRes = await strictApp.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({
          email: address,
          password: PASSWORD,
          name: "Strict",
        }),
      });
      expect(signUpRes.status).toBe(200);

      const signInRes = await strictApp.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ email: address, password: PASSWORD }),
      });
      expect(signInRes.status).toBe(403);
    },
    TIMEOUT
  );
});
