import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { refreshTokens } from "../db/schema/auth";

/**
 * Opaque refresh tokens, stored as `<id>.<secret>` client-side with only the
 * sha256 of the secret in the DB. Rotated on every refresh; presenting an
 * already-revoked token is treated as theft and kills every session.
 */

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(input: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const secret = randomSecret();
  const row = await db
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash: sha256(secret),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    .returning({ id: refreshTokens.id })
    .then((res) => res[0]);
  return `${row.id}.${secret}`;
}

export type RefreshVerification =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: "invalid" | "expired" | "reused"; userId?: string };

export async function verifyRefreshToken(
  token: string
): Promise<RefreshVerification> {
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0) return { ok: false, reason: "invalid" };
  const id = token.slice(0, dotIndex);
  const secret = token.slice(dotIndex + 1);
  if (!/^[0-9a-f-]{36}$/.test(id) || !secret) {
    return { ok: false, reason: "invalid" };
  }

  const row = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.id, id))
    .then((res) => res[0]);
  if (!row) return { ok: false, reason: "invalid" };

  const matches = timingSafeEqual(
    Buffer.from(sha256(secret), "hex"),
    Buffer.from(row.tokenHash, "hex")
  );

  // Revoked token or wrong secret for a real id = theft signal
  if (row.revokedAt || !matches) {
    return { ok: false, reason: "reused", userId: row.userId };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired", userId: row.userId };
  }
  return { ok: true, userId: row.userId, tokenId: row.id };
}

/** Revoke the old token, mint its replacement, and link them. */
export async function rotateRefreshToken(
  tokenId: string,
  userId: string
): Promise<string> {
  const replacement = await issueRefreshToken(userId);
  const replacementId = replacement.slice(0, replacement.indexOf("."));
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedBy: replacementId })
    .where(eq(refreshTokens.id, tokenId));
  return replacement;
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, tokenId), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))
    );
}
