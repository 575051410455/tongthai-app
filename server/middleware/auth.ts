import { createMiddleware } from "hono/factory";

import { auth } from "../lib/auth";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  image: string | null | undefined;
};

type Env = {
  Variables: {
    user: AuthUser;
  };
};

/**
 * Authenticates the request against the better-auth session (ADR 0001).
 * Sessions are DB-backed and read fresh on every request — the cookie cache
 * is deliberately disabled so revocation takes effect instantly.
 */
export const getUser = createMiddleware<Env>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const { user } = session;
  c.set("user", {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    image: user.image,
  });

  await next();
});

export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  if (c.var.user?.role !== "admin") {
    return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }
  await next();
});
