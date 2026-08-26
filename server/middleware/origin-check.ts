import { createMiddleware } from "hono/factory";

import { authEnv } from "../lib/env";

/**
 * Origin check for unsafe (state-changing) API requests — the CSRF posture
 * that replaced the retired double-submit token (ADR 0001). Browsers always
 * send Origin on unsafe requests; a foreign origin is rejected outright.
 * Requests without an Origin header (curl, server-to-server, tests) pass —
 * they don't ride ambient browser cookies, which is what CSRF is about.
 * better-auth applies the same policy to /api/auth itself.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const allowedOrigins = new Set(
  [
    authEnv.BASE_URL,
    ...authEnv.TRUSTED_ORIGINS,
    ...(authEnv.isProd ? [] : ["http://localhost:5173"]),
  ].map((o) => new URL(o).origin)
);

export const originCheck = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }
  const origin = c.req.header("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return c.json({ error: "Forbidden", code: "ORIGIN_FORBIDDEN" }, 403);
  }
  await next();
});
