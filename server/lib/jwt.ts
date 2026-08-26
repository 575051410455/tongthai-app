import { sign, verify } from "hono/jwt";
import { authEnv } from "./env";

/**
 * Access JWTs: HS256, 15-minute TTL, domain-separated secret. Claims carry
 * only `sub` (user id) and `tv` (tokenVersion) — everything else is read
 * from the DB on each request.
 */

const ACCESS_SECRET = `${authEnv.SECRET_KEY}::access`;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type AccessTokenPayload = {
  sub: string;
  tv: number;
  iat: number;
  exp: number;
};

export function signAccessToken(userId: string, tokenVersion: number) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    sub: userId,
    tv: tokenVersion,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
  };
  return sign(payload, ACCESS_SECRET);
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    // hono/jwt verifies HS256 by default and rejects other algorithms
    const payload = (await verify(token, ACCESS_SECRET)) as AccessTokenPayload;
    if (typeof payload.sub !== "string" || typeof payload.tv !== "number") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
