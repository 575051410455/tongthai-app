/**
 * Password hashing with argon2id via Bun's built-in hasher (no dependency).
 * (The auth spec shipped with bcryptjs and flagged it as a residual risk —
 * this implementation adopts its own recommendation.)
 */

const ARGON2_OPTS = {
  algorithm: "argon2id",
  memoryCost: 19456, // 19 MiB — OWASP-recommended baseline
  timeCost: 2,
} as const;

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ARGON2_OPTS);
}

export function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

// Verified against when the email doesn't exist, so response timing doesn't
// reveal which accounts are real.
const DUMMY_HASH = await Bun.password.hash(
  "dummy-password-for-timing-equalization",
  ARGON2_OPTS
);

export async function verifyAgainstDummy(password: string): Promise<void> {
  await Bun.password.verify(password, DUMMY_HASH);
}
