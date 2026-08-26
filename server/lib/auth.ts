import { Pool } from "pg";
import { betterAuth } from "better-auth";

import { authEnv } from "./env";
import { hashPassword, verifyPassword } from "./password";

/**
 * The auth core (ADR 0001): better-auth, self-hosted in this Hono app.
 * Owns its own tables (user/session/account/verification) through the pg
 * driver — deliberately outside Drizzle. DDL lives in hand-written
 * migrations under drizzle/, per the established pattern.
 */
export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  secret: authEnv.SECRET_KEY,
  baseURL: authEnv.BASE_URL,
  basePath: "/api/auth",
  trustedOrigins: [
    ...authEnv.TRUSTED_ORIGINS,
    // Vite dev server (proxies /api but sends its own Origin)
    ...(authEnv.isProd ? [] : ["http://localhost:5173"]),
  ],
  emailAndPassword: {
    enabled: true,
    disableSignUp: !authEnv.ALLOW_PUBLIC_REGISTRATION,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // argon2id via Bun.password — deliberate continuation of the Tongthai
    // spec's recorded deviation (ADR 0001). Never better-auth's default.
    password: {
      hash: (password) => hashPassword(password),
      verify: ({ hash, password }) => verifyPassword(password, hash),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // sliding — refreshed after a day of activity
    // Cookie cache deliberately DISABLED: a cached session cookie would keep
    // authenticating for its maxAge after revocation. Instant revocation was
    // a core Tongthai property worth keeping; one DB read per request equals
    // the old system's per-request user re-read anyway.
    cookieCache: { enabled: false },
  },
  user: {
    additionalFields: {
      // Feeds the requireAdmin gate; never client-settable
      role: { type: "string", defaultValue: "user", input: false },
    },
  },
  advanced: {
    cookiePrefix: "tt",
    useSecureCookies: authEnv.cookieSecure,
  },
});

export type Auth = typeof auth;
