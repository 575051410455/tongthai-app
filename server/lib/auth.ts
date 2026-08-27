import { Pool } from "pg";
import { betterAuth } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";

import { audit, type AuditAction } from "./audit";
import { allowedOrigins, authEnv } from "./env";
import { emailTransport } from "./email";
import { hashPassword, verifyPassword } from "./password";

/**
 * The auth core (ADR 0001): better-auth, self-hosted in this Hono app.
 * Owns its own tables (user/session/account/verification) through the pg
 * driver — deliberately outside Drizzle. DDL lives in hand-written
 * migrations under drizzle/, per the established pattern.
 */

// One pool shared by every instance (tests create variants via createAuth)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type AuthOverrides = {
  requireEmailVerification?: boolean;
  allowRegistration?: boolean;
  resetPasswordTokenExpiresIn?: number;
  rateLimit?: {
    enabled: boolean;
    window?: number;
    max?: number;
    storage?: "memory" | "database";
  };
};

// Audited auth events (parity with the Tongthai audit trail)
const AUDITED_PATHS: Record<string, AuditAction> = {
  "/sign-up/email": "register",
  "/sign-in/email": "login_success",
  "/sign-out": "logout",
  "/change-password": "password_changed",
  "/revoke-sessions": "logout_all",
};

export function createAuth(overrides: AuthOverrides = {}) {
  return betterAuth({
    database: pool,
    secret: authEnv.SECRET_KEY,
    baseURL: authEnv.BASE_URL,
    basePath: "/api/auth",
    // One shared origin policy with the API origin check (see env.ts)
    trustedOrigins: allowedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: !(
        overrides.allowRegistration ?? authEnv.ALLOW_PUBLIC_REGISTRATION
      ),
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification:
        overrides.requireEmailVerification ??
        authEnv.REQUIRE_EMAIL_VERIFICATION,
      // argon2id via Bun.password — deliberate continuation of the Tongthai
      // spec's recorded deviation (ADR 0001). Never better-auth's default.
      password: {
        hash: (password) => hashPassword(password),
        verify: ({ hash, password }) => verifyPassword(password, hash),
      },
      // links are time-limited: 30 min (tests shrink this via overrides)
      resetPasswordTokenExpiresIn: overrides.resetPasswordTokenExpiresIn ?? 60 * 30,
      // Completing a reset closes the door behind you
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await audit({ action: "password_reset", userId: user.id });
      },
      sendResetPassword: async ({ user, url }) => {
        await emailTransport.send({
          to: user.email,
          subject: "Reset your password",
          text: [
            `Hi ${user.name},`,
            "",
            "Reset your Expense Tracker password by opening:",
            url,
            "",
            "The link works once and expires in 30 minutes. If you didn't",
            "ask for this, you can ignore this email.",
          ].join("\n"),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60, // links are time-limited: 1 hour
      sendVerificationEmail: async ({ user, url }) => {
        await emailTransport.send({
          to: user.email,
          subject: "Verify your email",
          text: [
            `Hi ${user.name},`,
            "",
            "Confirm your email address for Expense Tracker by opening:",
            url,
            "",
            "If you didn't create an account, you can ignore this email.",
          ].join("\n"),
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // sliding — refreshed after a day of activity
      // Cookie cache deliberately DISABLED: a cached session cookie would
      // keep authenticating for its maxAge after revocation. Instant
      // revocation was a core Tongthai property worth keeping; one DB read
      // per request equals the old system's per-request user re-read anyway.
      cookieCache: { enabled: false },
    },
    user: {
      additionalFields: {
        // Feeds the requireAdmin gate; never client-settable
        role: { type: "string", defaultValue: "user", input: false },
      },
    },
    rateLimit: {
      // On by default in production (better-auth's own posture); tests turn
      // it on explicitly via overrides.
      enabled: overrides.rateLimit?.enabled ?? authEnv.isProd,
      window: overrides.rateLimit?.window ?? 60,
      max: overrides.rateLimit?.max ?? 60,
      storage:
        overrides.rateLimit?.storage ??
        (authEnv.RATE_LIMIT_BACKEND === "postgres" ? "database" : "memory"),
      // Tongthai-parity limits on the abuse-prone endpoints (dropped when a
      // test overrides the global knobs, so tests exercise those instead)
      customRules: overrides.rateLimit
        ? undefined
        : {
            "/sign-in/email": { window: 15 * 60, max: 20 },
            "/sign-up/email": { window: 15 * 60, max: 20 },
            "/request-password-reset": { window: 15 * 60, max: 10 },
          },
    },
    hooks: {
      // after-hooks run even when the endpoint threw (the APIError lands in
      // ctx.context.returned) — a failed attempt must never be recorded as
      // its success action. isAPIError (not instanceof) because better-call's
      // validation layer throws a base-class APIError that instanceof misses.
      after: createAuthMiddleware(async (ctx) => {
        if (isAPIError(ctx.context.returned)) {
          if (ctx.path === "/sign-in/email") {
            await audit({ action: "login_failed" });
          }
          return;
        }
        const action = AUDITED_PATHS[ctx.path];
        if (!action) return;
        const userId =
          ctx.context.newSession?.user.id ??
          ctx.context.session?.user.id ??
          null;
        // Best-effort by design — never breaks the request (audit swallows)
        await audit({ action, userId });
      }),
    },
    advanced: {
      cookiePrefix: "tt",
      useSecureCookies: authEnv.cookieSecure,
    },
  });
}

export const auth = createAuth();

export type Auth = typeof auth;
