# Expense Tracker — Frontend

The frontend of [Bun-Hono-React-Expense-Tracker](../README.md), built on the
[shadcn-admin](https://github.com/satnaing/shadcn-admin) template (v2.2.1) —
its UI/UX is followed 1:1, with the expense features implemented using the
template's own patterns.

## Stack

- React 19 + Vite 8, TypeScript
- TanStack Router (file-based), TanStack Query, TanStack Table
- Tailwind CSS v4 + shadcn/ui (Radix primitives)
- **Auth: self-hosted better-auth** (ADR 0001) — the template's own
  sign-in/sign-up/forgot-password pages (plus a reset-password page) call the
  typed better-auth client; the session lives in one httpOnly `tt.*` cookie;
  `useAuth()` is the single way components read auth state;
  `_authenticated` is guarded in `beforeLoad`
- Hono RPC client (`hc`) — expense API types imported from `../server`
  (`@server/*` alias)

## Run locally

1. From the repo root: `bun install`, then `cd frontend && bun install`
2. No frontend `.env` needed — all auth config lives on the server
3. Start the API server from the repo root: `bun dev` (needs `DATABASE_URL`
   and `SECRET_KEY` — see the root README)
4. Start the frontend:

   ```sh
   bun dev
   ```

   Vite proxies `/api` to `http://127.0.0.1:3000`.

## Scripts

- `bun run build` — typecheck (`tsc -b`) + production bundle to `dist/`
  (served statically by the Bun server)
- `bun run lint` / `bun run format` — ESLint / Prettier
- `bun run test` — Vitest browser-mode tests (run
  `bun run test:browser:install` once to fetch Chromium)

## Where things live

- `src/features/expenses/` — the expenses feature (data table, create drawer,
  delete dialogs), modeled 1:1 on the template's `tasks` feature
- `src/features/auth/` — the template's sign-in / sign-up / forgot-password /
  reset-password pages, calling the better-auth client
- `src/features/settings/account/` — real account management: profile name,
  change password, sign out everywhere
- `src/features/dashboard/` — dashboard with live Total Spent / Recent Expenses
- `src/lib/auth-client.ts` — typed better-auth client;
  `src/hooks/use-auth.ts` — the one session hook
- `src/lib/api.ts` — Hono RPC client for expenses + TanStack Query options +
  `ApiError`
- `src/routes/` — file-based routes; `_authenticated/` is guarded via the
  session query in `beforeLoad`
