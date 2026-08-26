# Expense Tracker (Bun + Hono + shadcn-admin)

Full-stack personal expense tracker:

- **API**: Bun + Hono, Drizzle ORM + PostgreSQL
- **Frontend**: React 19 + Vite, [shadcn-admin](https://github.com/satnaing/shadcn-admin) template (TanStack Router/Query/Table, Tailwind v4)
- **Auth (self-hosted)**: argon2id passwords, 15-min access JWT + rotating opaque refresh tokens in httpOnly cookies, tokenVersion revocation, double-submit CSRF, rate limiting, account lockout, audit log — no external auth provider
- **Type safety**: Hono RPC client — API types are shared end-to-end with no codegen

See [PRD.md](../PRD.md) for the full product spec and `../docs/memory.md` for project notes.

## Setup

1. Install dependencies:

   ```sh
   bun install
   cd frontend && bun install
   ```

2. Configure environment — copy `.env.example` → `.env` and set:
   - `DATABASE_URL` — PostgreSQL connection string
   - `SECRET_KEY` — ≥ 32 random characters (signs access JWTs)
   - `ALLOW_PUBLIC_REGISTRATION=true` — enables the /sign-up page

   The frontend needs no environment variables.

3. Apply database migrations (creates `users`, `refresh_tokens`, `audit_logs`, `rate_limit_buckets`, `expenses`):

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
