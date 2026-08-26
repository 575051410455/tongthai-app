# Expense Tracker (Bun + Hono + shadcn-admin)

Full-stack personal expense tracker:

- **API**: Bun + Hono, Drizzle ORM + PostgreSQL
- **Frontend**: React 19 + Vite, [shadcn-admin](https://github.com/satnaing/shadcn-admin) template (TanStack Router/Query/Table, Tailwind v4)
- **Auth (self-hosted)**: [better-auth](https://better-auth.com) inside the same Hono app (ADR 0001) — argon2id passwords via `Bun.password`, DB-backed revocable sessions in an httpOnly `tt.*` cookie, email verification + password reset through a pluggable email transport (dev transport captures mail; no SMTP needed locally), origin-check CSRF posture, rate limiting, audit log — no external auth provider
- **Type safety**: Hono RPC client for the expense API; the typed better-auth client for auth — shared end-to-end with no codegen

See [PRD.md](../PRD.md) for the full product spec and `../docs/memory.md` for project notes.

## Setup

1. Install dependencies:

   ```sh
   bun install
   cd frontend && bun install
   ```

2. Configure environment — copy `.env.example` → `.env` and set:
   - `DATABASE_URL` — PostgreSQL connection string
   - `SECRET_KEY` — ≥ 32 random characters (signs the session cookie and emailed links)
   - `ALLOW_PUBLIC_REGISTRATION=true` — enables the /sign-up page
   - `BASE_URL` — public origin (defaults to `http://localhost:3000`); emailed links use it
   - `EMAIL_TRANSPORT=dev` — captures outgoing mail locally instead of sending
   - `REQUIRE_EMAIL_VERIFICATION=true` — optionally block sign-in until verified

   The frontend needs no environment variables.

3. Apply database migrations (creates the better-auth tables `user`, `session`, `account`, `verification`, `rateLimit` plus `audit_logs`, `rate_limit_buckets`, `expenses`):

   ```sh
   bun migrate.ts
   ```

## Develop

- API (watch mode on :3000):

  ```sh
  bun dev
  ```

- Frontend (Vite dev server; proxies `/api` — cookies included — to `127.0.0.1:3000`):

  ```sh
  cd frontend && bun dev
  ```

## Build & Run

```sh
cd frontend && bun run build   # typecheck + bundle into frontend/dist
bun start                      # serves the API and the built SPA on :3000
```

## Deploy (Fly.io)

```sh
fly deploy
```

Set `DATABASE_URL` and `SECRET_KEY` as Fly secrets (plus `TRUST_PROXY` with Fly's proxy CIDRs if you need real client IPs). No build args required.
