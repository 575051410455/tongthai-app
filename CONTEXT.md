# Expense Tracker

A multi-user personal expense tracker: a Bun + Hono API and a React SPA (shadcn-admin template) in one process, with self-hosted Clerk-style authentication.

## Language

### Accounts & identity

**User**:
A person with an account; owns their Expenses and sees no one else's.
_Avoid_: customer, member, account

**Admin**:
A User whose Role grants access to administrative capabilities.
_Avoid_: superuser

**Role**:
The capability tier of a User: `user` or `admin`. Global to the instance — not per-team or per-workspace.
_Avoid_: permission, group; superadmin, cashier, manager (template leftovers with no meaning here)

**Ban**:
An Admin's block on a User's ability to sign in. Banning revokes the User's Sessions immediately and keeps their data; a banned User can be unbanned. A User is active or banned.
_Avoid_: suspend, deactivate (template terms), delete (a different, destructive act)

**Verification**:
Proof that a User owns their email address, established by following a single-use, time-limited emailed link. A User is verified or unverified.
_Avoid_: activation, confirmation

**Registration toggle**:
The operator switch that opens or closes public sign-up for the instance.
_Avoid_: invite mode

### Sessions

**Session**:
A database-backed record of one signed-in browser or device; revocable individually or all at once. Since ADR 0001 this replaces the retired access/refresh token pair.
_Avoid_: token, JWT (legacy Tongthai terms)

**Sign out everywhere**:
Revoking all of a User's Sessions at once.
_Avoid_: logout-all, revoke-all

**Password reset**:
Self-serve recovery via a single-use, time-limited emailed link; completing it revokes the User's other Sessions.
_Avoid_: forgot-password flow (that is just the entry form)

### Infrastructure

**Email transport**:
The single interface through which the app sends any email. The dev/test transport captures messages instead of sending them.
_Avoid_: mailer, SMTP client (those are implementations)

**Tongthai**:
The name of the retired hand-rolled auth spec (see ADR 0001). Survives only as the `tt` cookie prefix.

### Expenses

**Expense**:
A single spending record — title, amount, date — owned by exactly one User.
_Avoid_: transaction, entry
