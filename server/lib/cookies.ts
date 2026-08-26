import { timingSafeEqual } from "node:crypto";
import { type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ACCESS_TOKEN_TTL_SECONDS } from "./jwt";
import { REFRESH_TOKEN_TTL_MS } from "./tokens";
import { authEnv } from "./env";

/**
 * Two tokens, two httpOnly cookies (`tt_access` JWT 15 min, `tt_refresh`
 * opaque 7 days) plus a readable `tt_csrf` cookie for double-submit CSRF.
 * `__Host-` prefixed when no COOKIE_DOMAIN is set and cookies are secure,
 * so a compromised subdomain can't shadow them.
 */

const useHostPrefix = authEnv.cookieSecure && !authEnv.COOKIE_DOMAIN;
const prefix = useHostPrefix ? "__Host-" : "";

export const ACCESS_COOKIE = `${prefix}tt_access`;
export const REFRESH_COOKIE = `${prefix}tt_refresh`;
export const CSRF_COOKIE = `${prefix}tt_csrf`;
export const CSRF_HEADER = "x-csrf-token";

const baseCookieOptions = {
  path: "/",
  sameSite: "Lax",
  secure: authEnv.cookieSecure,
  ...(useHostPrefix ? {} : authEnv.COOKIE_DOMAIN ? { domain: authEnv.COOKIE_DOMAIN } : {}),
} as const;

export function setAuthCookies(
  c: Context,
  accessToken: string,
  refreshToken: string
) {
  setCookie(c, ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
  setCookie(c, REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
  });
  refreshCsrfCookie(c);
}

export function clearAuthCookies(c: Context) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    deleteCookie(c, name, { ...baseCookieOptions });
  }
}

export function refreshCsrfCookie(c: Context): string {
  const existing = getCookie(c, CSRF_COOKIE);
  const value = existing ?? randomToken();
  // Re-minted on every authenticated request (24h sliding window)
  setCookie(c, CSRF_COOKIE, value, {
    ...baseCookieOptions,
    httpOnly: false,
    maxAge: 24 * 60 * 60,
  });
  return value;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Fail-closed double-submit CSRF check. Applies to unsafe methods from
 * cookie-authenticated clients; pure-Bearer clients have no cookie to forge
 * and are exempt. A missing CSRF cookie alongside an auth cookie is refused
 * (CSRF_MISSING) — the client should hit GET /api/auth/me to re-mint, then
 * retry.
 */
export const csrfCheck: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }
  const hasAuthCookie =
    getCookie(c, ACCESS_COOKIE) !== undefined ||
    getCookie(c, REFRESH_COOKIE) !== undefined;
  if (!hasAuthCookie) {
    return next();
  }

  const cookieValue = getCookie(c, CSRF_COOKIE);
  if (!cookieValue) {
    return c.json({ error: "CSRF token missing", code: "CSRF_MISSING" }, 403);
  }
  const headerValue = c.req.header(CSRF_HEADER);
  if (!headerValue || !timingSafeEqualStrings(cookieValue, headerValue)) {
    return c.json({ error: "CSRF check failed", code: "CSRF_MISSING" }, 403);
  }
  return next();
};

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
