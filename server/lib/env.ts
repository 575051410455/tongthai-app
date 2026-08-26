import { z } from "zod";

const AuthEnv = z
  .object({
    NODE_ENV: z.string().default("development"),
    SECRET_KEY: z.string().optional(),
    // CIDR allowlist only (e.g. "10.0.0.0/8,::1/128"); empty = never trust XFF
    TRUST_PROXY: z.string().default(""),
    COOKIE_SECURE: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    ALLOW_PUBLIC_REGISTRATION: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    // When true, sign-in is blocked until the email is verified
    REQUIRE_EMAIL_VERIFICATION: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
    RATE_LIMIT_BACKEND: z.enum(["memory", "postgres"]).default("memory"),
    // Public origin of the app — better-auth uses it for cookies/links
    BASE_URL: z.string().url().default("http://localhost:3000"),
    // Extra origins allowed to call the auth API (comma-separated).
    // The Vite dev server origin is added automatically outside production.
    TRUSTED_ORIGINS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    // "dev" captures mail instead of delivering it (no SMTP needed locally).
    // Real delivery transports are added here when a vendor is chosen.
    EMAIL_TRANSPORT: z.enum(["dev"]).default("dev"),
  })
  .transform((env) => {
    const isProd = env.NODE_ENV === "production";
    return {
      ...env,
      isProd,
      // Default secure cookies on in prod, off in dev (plain http localhost)
      cookieSecure: env.COOKIE_SECURE ?? isProd,
    };
  });

const parsed = AuthEnv.parse(process.env);

if (parsed.isProd) {
  if (!parsed.SECRET_KEY || parsed.SECRET_KEY.length < 32) {
    throw new Error(
      "SECRET_KEY is required in production and must be at least 32 characters"
    );
  }
} else if (!parsed.SECRET_KEY || parsed.SECRET_KEY.length < 32) {
  console.warn(
    "[auth] SECRET_KEY missing or too short — using an INSECURE dev fallback"
  );
}

const trustProxyRaw = parsed.TRUST_PROXY.trim();
if (["true", "*", "0.0.0.0/0", "::/0"].includes(trustProxyRaw)) {
  throw new Error(
    "TRUST_PROXY must be a CIDR allowlist (e.g. 10.0.0.0/8,::1/128) — blanket trust is not allowed"
  );
}

export const authEnv = {
  ...parsed,
  SECRET_KEY:
    parsed.SECRET_KEY && parsed.SECRET_KEY.length >= 32
      ? parsed.SECRET_KEY
      : "insecure-dev-secret-key-do-not-use-in-production!!",
};
