# Project work memory

Last updated: 2026-09-06 (Asia/Bangkok).

## Current objective and agreed scope

The user asked whether Auth is ready and invoked `grill-with-docs`. They explicitly confirmed that **ready means ready for real users on the internet**, not just local development. They then asked to continue the assessment and save completed work in `docs/memory.md`.

The user subsequently confirmed: **Admin creates users for the first release**. Public self-registration is outside the first-release scope; production should keep `ALLOW_PUBLIC_REGISTRATION=false`. This settles who creates users, but does not yet decide how a new user receives access or sets their first password.

Current conclusion: **the Auth core is implemented, but production readiness has not been achieved or demonstrated**. Real email delivery is missing, and release build/deployment/integration verification remains incomplete. The confirmed public-registration flow mismatch is outside the selected first-release scope while self-registration stays disabled. This session has assessed the implementation and recorded findings; it has not changed Auth behavior or deployed anything.

## Completed work: project logo replacement (2026-09-05)

The user supplied `frontend/public/images/logo-light.png` and `frontend/public/images/favicon_light.png` and requested project-wide logo replacement.

- Replaced the template SVG in [Logo](../frontend/src/assets/logo.tsx) with an image using `/images/logo-light.png`, accessible alt text, and `object-contain` to preserve the artwork's proportions.
- Updated [AuthLayout](../frontend/src/features/auth/auth-layout.tsx), shared by sign-in, sign-up, forgot-password, and reset-password pages.
- Updated [sidebar data](../frontend/src/components/layout/data/sidebar-data.ts) and [TeamSwitcher](../frontend/src/components/layout/team-switcher.tsx) to use the shared Logo for the application/team entries, including the collapsed sidebar and dropdown.
- Added the shared Logo to the alternative [AppTitle](../frontend/src/components/layout/app-title.tsx) and aligned its old template title with the existing Expense Tracker title.
- Updated [frontend/index.html](../frontend/index.html) to use `/images/favicon_light.png` for the browser favicon and Apple touch icon, removing references to the deleted favicon variants.

Verification performed in that session:

- ESLint passed for the changed TypeScript/TSX files; formatting and `git diff --check` passed.
- Browser smoke checks passed for the four Auth pages and the `/tasks` sidebar in light/dark themes, the team dropdown, collapsed sidebar, and mobile sign-in layout. Authenticated-page checks used a mocked session, not real login.
- Both image URLs returned HTTP 200.
- `bunx vite build` passed.
- `bun run build` failed during `tsc -b` with JavaScript heap out of memory at the default approximately 4 GB heap limit. The typecheck failure was not fixed. This was the 2026-09-05 result, not a fresh build result from the Auth assessment.

Other edits and image variants were already present or appeared independently in the shared workspace. They were preserved. Do not attribute all working-tree changes to this session; in particular, lockfiles, skills directories, extra image variants, and `nav-user.tsx` were not authored as part of the logo replacement described above.

## Completed work: Auth readiness assessment (2026-09-06)

Read the requested `grill-with-docs` skill and its `grilling` and `domain-modeling` dependencies. Reviewed [CONTEXT.md](../CONTEXT.md), [ADR 0001](adr/0001-migrate-auth-core-to-better-auth.md), backend Auth configuration/middleware/tests, frontend forms/client/session handling, and deployment configuration. A backend fact-finding sub-agent checked the implementation and test isolation in parallel.

### Existing implementation

The application uses self-hosted better-auth inside Hono. ADR 0001 deliberately replaces the previous custom JWT/refresh-token system with database-backed sessions.

- Email/password authentication with Argon2id through `Bun.password`.
- Database-backed sessions, configured for seven days, with cookie caching disabled for immediate server-side revocation.
- Verification email and password-reset callbacks; reset links are configured for 30 minutes, and password reset revokes sessions.
- Admin/user roles, user administration, ban/unban behavior, and server-side access checks.
- Profile-name updates, password changes, and a sign-out-everywhere UI.
- Origin checks, rate limiting, and audit logging.

These are implementation findings, not a claim that all integration tests or deployed behavior passed. Main sources: [auth.ts](../server/lib/auth.ts), [auth middleware](../server/middleware/auth.ts), [app.ts](../server/app.ts), and [account settings](../frontend/src/features/settings/account/index.tsx).

### Confirmed gaps and verification limits

1. **No real email delivery.** [env.ts](../server/lib/env.ts) only accepts `EMAIL_TRANSPORT=dev`. [email.ts](../server/lib/email.ts) only implements `DevTransport`, which captures messages in memory and logs them outside tests. Verification/reset emails do not reach real inboxes. A production transport requires implementation, not just setting an SMTP credential.

2. **Registration mishandles required email verification.** [register()](../frontend/src/lib/api.ts) calls `getCurrentUser()` after every successful sign-up. The installed better-auth implementation returns a successful sign-up without creating a session when `requireEmailVerification` is true. Consequently, registration rejects with `Not authenticated` (401), and [SignUpForm](../frontend/src/features/auth/sign-up/components/sign-up-form.tsx) displays an error instead of a check-your-email state. This conditional behavior was reproduced with a mocked auth client: successful sign-up followed by a null session. No network requests or database access were used. The local verification flag is currently off. After the user's decision to use Admin-created users, this is deferred unless public self-registration is enabled later; it is not evidence that Admin-created user onboarding fails.

3. **Production environment is unverified.** The local environment inspected was development, with `COOKIE_SECURE=false`, no explicit `BASE_URL`, `ALLOW_PUBLIC_REGISTRATION=false`, default verification off, default dev email, and memory rate limiting. These are local observations, not evidence of the settings on a deployed server. Public origin, secure cookies, email delivery, and deployment-specific proxy/instance settings still need verification for the actual target.

4. **Release build is not yet verified.** The previous full frontend build exhausted the TypeScript heap. Docker's build stage invokes `bun run build`, so the successful Vite-only build does not establish that the deployment build works.

5. **Database-backed integration tests were not run in this assessment.** The suites use `DATABASE_URL` directly; the configured connection is remote and was not established to be disposable. In particular, [hardening.test.ts](../server/hardening.test.ts) deletes the entire `rateLimit` table and some recent audit entries during cleanup. Running this suite requires a disposable test database. No application database records or migrations were changed in this session.

6. **Social sign-in remains a placeholder.** GitHub/Facebook buttons on sign-in/sign-up are disabled with `Coming soon`; providers are not configured in the Auth core. ADR 0001 treats OAuth/MFA/organizations as future capabilities. Their absence is only a launch blocker if the user requires them for the first release.

7. **Session-revocation error handling needs follow-up.** Account settings redirects to sign-in after `revokeSessions()` even if it fails, and does not inspect the client's returned `error`. The navigation alone is not evidence that every server-side session was revoked. This was identified by source inspection, not reproduced against the backend.

8. **Public registration UI contradicts the selected enrollment policy.** [SignIn](../frontend/src/features/auth/sign-in/index.tsx) still links to Sign Up, and [SignUp](../frontend/src/features/auth/sign-up/index.tsx) renders its form unconditionally. The server-side registration toggle already supports disabling self-registration, but the visible entry points need to match the first-release policy. This is a UI inconsistency, not a demonstrated bypass of the server-side restriction. No UI change has been applied yet.

### Follow-up after enrollment was decided

- Confirmed [UsersActionDialog](../frontend/src/features/users/components/users-action-dialog.tsx) already lets an Admin create a user with name, email, role, and an initial password. [createUser()](../frontend/src/features/users/api.ts) calls `authClient.admin.createUser`.
- The existing [seed-admin.ts](../seed-admin.ts) provides first-Admin bootstrapping independently of public registration. It was inspected, not executed.
- The current Admin form sets the initial password. This is existing behavior, not the user's decision about credential handoff. A user-set password link or an Admin-assigned initial password still needs to be chosen after the outstanding first-round answers.

### Tests and checks completed today

- `NODE_ENV=test bun test server/lib/email.test.ts`: **4 passed, 0 failed**. This checks message capture, not real email delivery.
- Existing frontend browser tests: **5 files passed, 11 tests passed**. Covered sign-in, forgot password, reset password, verification banner, and sign-out dialog. These tests mock Auth APIs; they do not prove the complete browser/API/database/email flow.
- The frontend tests were run through Vitest's programmatic API, preserving the repository Vite configuration, with a temporary runtime provider override: `playwright({ launchOptions: { channel: 'chrome' } })`, headless mode, and watch disabled. The Playwright-managed Chromium version requested by this dependency installation was unavailable locally; installed Google Chrome was used successfully. No test configuration files were changed.
- Isolated registration reproduction confirmed the successful-sign-up/no-session mismatch described above.
- Read existing backend integration-test coverage for login/logout, expense ownership, verification, reset token expiry/reuse, password changes, session revocation, administration, ban/unban, throttling, and audit events. Presence of tests is recorded separately from passing results.

## Open decisions for the next grilling round

Confirmed decisions: production readiness for real users, and Admin-created users for the first release. The remaining questions from the current round are:

- First-release sign-in methods: email/password only, or social providers required at launch? Email/password is the proposed initial scope, consistent with the existing implementation and ADR's deferred features.
- Deployment and email infrastructure: the actual public domain/hosting target and an existing email delivery service/sender, if any. No provider has been selected in this session, and no credentials need to be recorded in this file.

Next-round decisions unlocked by Admin-created enrollment: how the user receives initial access/sets a password, and whether verification must be completed before sign-in. Do not infer these from the decision that Admin creates users.

## Next work suggested by the findings

After settling those product/deployment decisions, align public entry screens with Admin-created enrollment, implement real email delivery and the agreed first-access/verification flow, verify session-revocation failure handling, make the full release build pass, and run the backend suites against a disposable database. Then exercise the complete flows on the actual staging/production configuration, including Admin-created onboarding, delivery to an inbox, expired/reused reset links, session revocation, and admin/user access separation. Public self-registration fixes are deferred while that feature remains outside release scope.

No production deployment, real email sending, Auth implementation fixes, commits, or migration execution were performed as part of this assessment. No secrets are recorded here.

## Git checkpoint requested by the user (2026-09-06)

The user explicitly requested a new branch named `v01`, a commit, and a push to the repository remote. This checkpoint captures the current pending project changes, including the branding updates, this memory file, installed repository skills and their lockfile, and the existing Bun lockfile update.

The current branding has evolved since the initial PNG replacement: the shared Logo now uses `logo-light.svg`, and the browser favicon points to `logo-dark.svg`. The earlier PNG files have been removed from the working tree. Sidebar labels now include Tongthai / Tongthai Rubber Group, TTR, and TTT; the user-menu Upgrade to Pro entry has been removed. These intervening shared-workspace edits are preserved in the checkpoint. During preparation, the favicon MIME type was corrected from `image/png` to `image/svg+xml` to match its current asset.

This is a version-control checkpoint, not a declaration of production Auth readiness. The outstanding Auth decisions and limitations above remain applicable.

Checkpoint checks passed: ESLint for the changed UI components, `bunx vite build`, branding asset-path validation, and the staged whitespace check. The full TypeScript build was not rerun; its previously recorded heap failure remains unresolved.
