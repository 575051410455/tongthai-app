import { type Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema/auth";
import { ACCESS_COOKIE, refreshCsrfCookie, setAuthCookies } from "../lib/cookies";
import { signAccessToken, verifyAccessToken } from "../lib/jwt";
import { issueRefreshToken } from "../lib/tokens";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  tokenVersion: number;
  twoFactorEnabled: boolean;
  expiresAt: Date | null;
};

type Env = {
  Variables: {
    user: AuthUser;
  };
};

export function getAccessTokenFromRequest(c: Context): string | undefined {
  const cookieToken = getCookie(c, ACCESS_COOKIE);
  if (cookieToken) return cookieToken;
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  return undefined;
}

/**
 * Authenticates the request. The server is the source of truth: only `sub`
 * and `tv` are trusted from the JWT — the user row is re-read from the DB on
 * every request, and a tokenVersion mismatch means the token was revoked.
 */
export const getUser = createMiddleware<Env>(async (c, next) => {
  const token = getAccessTokenFromRequest(c);
  if (!token) {
    return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401);
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401);
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .then((res) => res[0]);
  if (!user) {
    return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401);
  }

  if (user.tokenVersion !== payload.tv) {
    return c.json({ error: "Token revoked", code: "TOKEN_REVOKED" }, 401);
  }

  if (user.expiresAt && user.expiresAt.getTime() <= Date.now()) {
    return c.json({ error: "Account expired", code: "ACCOUNT_EXPIRED" }, 403);
  }

  c.set("user", {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tokenVersion: user.tokenVersion,
    twoFactorEnabled: user.twoFactorEnabled,
    expiresAt: user.expiresAt,
  });

  // Sliding CSRF window — an active session never loses its CSRF cookie
  refreshCsrfCookie(c);

  await next();
});

export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  if (c.var.user?.role !== "admin") {
    return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }
  await next();
});

/** Instantly invalidates every outstanding access JWT for the user. */
export async function bumpTokenVersion(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId));
}

/**
 * Signs a fresh access JWT + refresh token and sets the cookies. Reads the
 * CURRENT tokenVersion from the DB first — if it was just bumped, a session
 * minted with a stale version would die immediately.
 */
export async function issueSession(c: Context, userId: string): Promise<void> {
  const user = await db
    .select({ tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, userId))
    .then((res) => res[0]);
  if (!user) {
    throw new Error("issueSession: user not found");
  }
  const accessToken = await signAccessToken(userId, user.tokenVersion);
  const refreshToken = await issueRefreshToken(userId);
  setAuthCookies(c, accessToken, refreshToken);
}
