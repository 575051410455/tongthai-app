---
status: accepted
date: 2026-08-26
---

# Migrate the auth core from the hand-rolled Tongthai stack to better-auth

The app shipped a self-hosted auth core built to the owner's "Tongthai" spec (15-min HS256 access JWT + rotating opaque refresh tokens, double-submit CSRF, lockout, audit logging) after rejecting hosted providers — Kinde first, then Clerk over its "Secured by Clerk" / "Development mode" badges. To reach Clerk-level account lifecycle (email verification, password reset, and later OAuth/MFA/organizations) without hand-building and hand-auditing each flow, the owner chose to replace the custom core with **better-auth**, self-hosted inside the same Hono app. The ~80%-complete Tongthai implementation is deliberately discarded: the maintained security surface and plugin path outweigh the sunk cost.

## Considered Options

- **Extend the Tongthai core** (assistant's recommendation): keeps the hardened, working implementation, but every future Clerk-parity feature remains bespoke security code. Rejected by the owner.
- **better-auth** (chosen): Clerk-like DX self-hosted; verification/reset/OAuth/MFA/orgs become config and plugins.
- **Separate auth service** (Clerk's real topology): rejected — needless cross-origin complexity for a single app.

## Consequences

- Session model changes from JWT + refresh rotation to DB-backed sessions; `token_version` and the double-submit CSRF token are retired.
- The legacy auth tables are dropped, not migrated — the owner chose a fresh start (no real accounts existed at decision time; only cleaned-up test rows).
- The Tongthai machine-readable error-code contract is retired; clients branch on better-auth's codes.
- Password hashing stays argon2id via `Bun.password` through better-auth's custom password functions — a deliberate continuation of the Tongthai spec's recorded deviation; do not "fix" this back to better-auth's default hasher.
- Hono stays on major 3 (better-auth mounts as a raw fetch handler); Drizzle stays as-is — better-auth owns its own tables via the `pg` driver, with DDL hand-written per the existing migration pattern.
- Auth endpoints leave the Hono RPC surface; the typed better-auth client replaces them.
