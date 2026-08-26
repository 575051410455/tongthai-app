import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { users } from "../db/schema/auth";
import { audit } from "../lib/audit";
import { rateLimitKey } from "../lib/client-ip";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "../lib/cookies";
import { authEnv } from "../lib/env";
import { signAccessToken } from "../lib/jwt";
import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from "../lib/password";
import {
  revokeAllRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyRefreshToken,
} from "../lib/tokens";
import {
  bumpTokenVersion,
  getUser,
  issueSession,
  type AuthUser,
} from "../middleware/auth";
import { authLimiter, tryConsume } from "../middleware/rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().min(1).max(100),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

const updateMeSchema = z.object({
  name: z.string().min(1).max(100),
});

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  twoFactorEnabled: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled,
  };
}

export const authRoute = new Hono()
  // ---------- Public ----------
  .post(
    "/register",
    authLimiter,
    zValidator("json", registerSchema),
    async (c) => {
      if (!authEnv.ALLOW_PUBLIC_REGISTRATION) {
        return c.json(
          { error: "Registration is disabled", code: "FORBIDDEN" },
          403
        );
      }
      const { email, password, name } = c.req.valid("json");

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .then((res) => res[0]);
      if (existing) {
        return c.json(
          { error: "Email is already registered", code: "EMAIL_TAKEN" },
          409
        );
      }

      const user = await db
        .insert(users)
        .values({ email, name, passwordHash: await hashPassword(password) })
        .returning()
        .then((res) => res[0]);

      await issueSession(c, user.id);
      await audit(c, "register", user.id);
      c.status(201);
      return c.json({ user: publicUser(user) });
    }
  )
  .post(
    "/login",
    authLimiter,
    zValidator("json", credentialsSchema),
    async (c) => {
      const { email, password } = c.req.valid("json");

      // Additional per-email throttle on top of the per-IP limiter
      const emailAllowed = await tryConsume(
        `login-email:${email}`,
        10,
        15 * 60 * 1000
      );
      if (!emailAllowed) {
        return c.json(
          { error: "Too many requests", code: "RATE_LIMITED" },
          429
        );
      }

      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .then((res) => res[0]);

      if (!user) {
        // Equalize timing so responses don't reveal which emails exist
        await verifyAgainstDummy(password);
        await audit(c, "login_failed", null, { email });
        return c.json(
          { error: "Invalid email or password", code: "INVALID_CREDENTIALS" },
          401
        );
      }

      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        return c.json(
          { error: "Account temporarily locked", code: "ACCOUNT_LOCKED" },
          403
        );
      }

      if (user.expiresAt && user.expiresAt.getTime() <= Date.now()) {
        return c.json(
          { error: "Account expired", code: "ACCOUNT_EXPIRED" },
          403
        );
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        const attempts = user.failedLoginAttempts + 1;
        const locked = attempts >= MAX_FAILED_ATTEMPTS;
        await db
          .update(users)
          .set({
            failedLoginAttempts: locked ? 0 : attempts,
            lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : null,
          })
          .where(eq(users.id, user.id));
        await audit(c, locked ? "account_locked" : "login_failed", user.id);
        return c.json(
          { error: "Invalid email or password", code: "INVALID_CREDENTIALS" },
          401
        );
      }

      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await db
          .update(users)
          .set({ failedLoginAttempts: 0, lockedUntil: null })
          .where(eq(users.id, user.id));
      }

      await issueSession(c, user.id);
      await audit(c, "login_success", user.id);
      return c.json({ user: publicUser(user) });
    }
  )
  .post("/refresh", async (c, next) => {
    // Own limiter, looser than the auth one (rotation is routine)
    const allowed = await tryConsume(
      `refresh:${rateLimitKey(c)}`,
      60,
      15 * 60 * 1000
    );
    if (!allowed) {
      return c.json({ error: "Too many requests", code: "RATE_LIMITED" }, 429);
    }
    return next();
  })
  .post("/refresh", async (c) => {
    const token = getCookie(c, REFRESH_COOKIE);
    if (!token) {
      return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401);
    }

    const result = await verifyRefreshToken(token);
    if (!result.ok) {
      clearAuthCookies(c);
      if (result.reason === "reused" && result.userId) {
        // Theft signal: kill every session for this user
        await revokeAllRefreshTokens(result.userId);
        await bumpTokenVersion(result.userId);
        await audit(c, "refresh_reuse_detected", result.userId);
        return c.json({ error: "Token revoked", code: "TOKEN_REVOKED" }, 401);
      }
      return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401);
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, result.userId))
      .then((res) => res[0]);
    if (!user) {
      clearAuthCookies(c);
      return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401);
    }
    if (user.expiresAt && user.expiresAt.getTime() <= Date.now()) {
      clearAuthCookies(c);
      return c.json({ error: "Account expired", code: "ACCOUNT_EXPIRED" }, 403);
    }

    const newRefresh = await rotateRefreshToken(result.tokenId, user.id);
    const accessToken = await signAccessToken(user.id, user.tokenVersion);
    setAuthCookies(c, accessToken, newRefresh);
    return c.json({ user: publicUser(user) });
  })
  .post("/logout", async (c) => {
    const token = getCookie(c, REFRESH_COOKIE);
    if (token) {
      const result = await verifyRefreshToken(token);
      if (result.ok) {
        await revokeRefreshToken(result.tokenId);
        await audit(c, "logout", result.userId);
      }
    }
    clearAuthCookies(c);
    return c.json({ ok: true });
  })
  // ---------- Authenticated ----------
  .get("/me", getUser, async (c) => {
    return c.json({ user: publicUser(c.var.user as AuthUser) });
  })
  .patch("/me", getUser, zValidator("json", updateMeSchema), async (c) => {
    const { name } = c.req.valid("json");
    const user = await db
      .update(users)
      .set({ name })
      .where(eq(users.id, c.var.user.id))
      .returning()
      .then((res) => res[0]);
    return c.json({ user: publicUser(user) });
  })
  .post(
    "/me/change-password",
    getUser,
    zValidator("json", changePasswordSchema),
    async (c) => {
      const { currentPassword, newPassword } = c.req.valid("json");
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, c.var.user.id))
        .then((res) => res[0]);

      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return c.json(
          { error: "Current password is incorrect", code: "INVALID_CREDENTIALS" },
          401
        );
      }

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(newPassword) })
        .where(eq(users.id, user.id));

      // Kick every other device: bump kills access JWTs, revoke kills refresh
      await bumpTokenVersion(user.id);
      await revokeAllRefreshTokens(user.id);
      // Re-issue for THIS device (issueSession re-reads the bumped version)
      await issueSession(c, user.id);
      await audit(c, "password_changed", user.id);
      return c.json({ ok: true });
    }
  )
  .post("/logout-all", getUser, async (c) => {
    await bumpTokenVersion(c.var.user.id);
    await revokeAllRefreshTokens(c.var.user.id);
    clearAuthCookies(c);
    await audit(c, "logout_all", c.var.user.id);
    return c.json({ ok: true });
  });
