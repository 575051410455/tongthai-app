import { afterAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import app from "./app";
import { db } from "./db";

/**
 * Admin surface tests at the HTTP seam (tickets 01/04/05/06): the whole app
 * via app.request() against the real Postgres. External behavior only —
 * status codes, cookies, and what a subsequent request can do.
 */

const RUN = `adm-e2e-${Date.now()}`;
const EMAIL_ADMIN = `${RUN}-admin@example.com`;
const EMAIL_USER = `${RUN}-user@example.com`;
const EMAIL_VICTIM = `${RUN}-victim@example.com`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3000";

const TIMEOUT = 60_000; // remote DB over DDNS is slow/flaky

afterAll(async () => {
  // expenses cascade with the user since 0006; audit rows are keyed by id text
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE ${RUN + "-%"})`
  );
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE ${RUN + "-%"}`);
});

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signUp(email: string, name: string): Promise<string> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD, name }),
  });
  expect(res.status).toBe(200);
  return cookiesFrom(res);
}

async function sessionUser(cookie: string): Promise<{ id: string; role: string }> {
  const res = await app.request("/api/auth/get-session", {
    headers: { Cookie: cookie },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string; role: string } };
  return body.user;
}

function adminPost(path: string, cookie: string, body: unknown) {
  return app.request(`/api/auth/admin/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: ORIGIN,
    },
    body: JSON.stringify(body),
  });
}

describe("admin surface cutover (ticket 01)", () => {
  let adminCookie: string;
  let userCookie: string;
  let adminId: string;
  let userId: string;

  test(
    "setup: two accounts; one promoted to Admin outside the API",
    async () => {
      adminCookie = await signUp(EMAIL_ADMIN, "The Admin");
      userCookie = await signUp(EMAIL_USER, "Regular User");
      await db.execute(
        sql`UPDATE "user" SET role = 'admin' WHERE email = ${EMAIL_ADMIN}`
      );
      // cookie cache is disabled, so the promotion is visible immediately
      const admin = await sessionUser(adminCookie);
      expect(admin.role).toBe("admin");
      adminId = admin.id;
      const user = await sessionUser(userCookie);
      expect(user.role).toBe("user");
      userId = user.id;
    },
    TIMEOUT
  );

  test(
    "anonymous requests get 401 from the admin surface",
    async () => {
      const res = await app.request("/api/auth/admin/list-users");
      expect(res.status).toBe(401);
    },
    TIMEOUT
  );

  test(
    "a non-Admin session gets 403 from every admin operation",
    async () => {
      const list = await app.request("/api/auth/admin/list-users", {
        headers: { Cookie: userCookie },
      });
      expect(list.status).toBe(403);

      // target someone else so the self-guard isn't what refuses it
      for (const [path, body] of [
        ["set-role", { userId: adminId, role: "user" }],
        ["ban-user", { userId: adminId }],
        ["unban-user", { userId: adminId }],
        ["remove-user", { userId: adminId }],
        ["create-user", { email: `${RUN}-x@example.com`, password: PASSWORD, name: "X" }],
      ] as const) {
        const res = await adminPost(path, userCookie, body);
        expect(res.status).toBe(403);
      }
    },
    TIMEOUT
  );

  test(
    "a Role cannot be set through self-service profile update",
    async () => {
      // update-user strips non-input fields; whether it 200s or 400s, the
      // role must not move.
      await app.request("/api/auth/update-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userCookie,
          Origin: ORIGIN,
        },
        body: JSON.stringify({ role: "admin" }),
      });
      const user = await sessionUser(userCookie);
      expect(user.role).toBe("user");
    },
    TIMEOUT
  );

  test(
    "an Admin can list users through the admin surface",
    async () => {
      const res = await app.request(
        `/api/auth/admin/list-users?searchField=email&searchOperator=starts_with&searchValue=${RUN}&limit=10`,
        { headers: { Cookie: adminCookie } }
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        users: { email: string; role: string }[];
        total: number;
      };
      expect(body.total).toBeGreaterThanOrEqual(2);
      const emails = body.users.map((u) => u.email);
      expect(emails).toContain(EMAIL_ADMIN);
      expect(emails).toContain(EMAIL_USER);
    },
    TIMEOUT
  );

  test(
    "an Admin cannot change their own Role",
    async () => {
      const res = await adminPost("set-role", adminCookie, {
        userId: adminId,
        role: "user",
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("YOU_CANNOT_CHANGE_YOUR_OWN_ROLE");
      expect((await sessionUser(adminCookie)).role).toBe("admin");
    },
    TIMEOUT
  );

  test(
    "an Admin cannot ban or remove themselves",
    async () => {
      const ban = await adminPost("ban-user", adminCookie, { userId: adminId });
      expect(ban.status).toBe(400);
      const remove = await adminPost("remove-user", adminCookie, {
        userId: adminId,
      });
      expect(remove.status).toBe(400);
      expect((await sessionUser(adminCookie)).role).toBe("admin");
    },
    TIMEOUT
  );

  test(
    "deleting a user removes their Expenses at the database level",
    async () => {
      const victimCookie = await signUp(EMAIL_VICTIM, "Victim");
      const victimId = (await sessionUser(victimCookie)).id;

      const create = await app.request("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: victimCookie,
          Origin: ORIGIN,
        },
        body: JSON.stringify({
          title: "Doomed expense",
          amount: "9.99",
          date: "2026-08-27",
        }),
      });
      expect(create.status).toBe(201);

      const remove = await adminPost("remove-user", adminCookie, {
        userId: victimId,
      });
      expect(remove.status).toBe(200);

      const expenses = (await db.execute(
        sql`SELECT id FROM expenses WHERE user_id = ${victimId}`
      )) as unknown as unknown[];
      expect(expenses).toHaveLength(0);
      const users = (await db.execute(
        sql`SELECT id FROM "user" WHERE id = ${victimId}`
      )) as unknown as unknown[];
      expect(users).toHaveLength(0);
    },
    TIMEOUT
  );

  test(
    "role escalation by a non-Admin targeting another user stays 403",
    async () => {
      const res = await adminPost("set-role", userCookie, {
        userId: adminId,
        role: "user",
      });
      expect(res.status).toBe(403);
      expect((await sessionUser(adminCookie)).role).toBe("admin");
    },
    TIMEOUT
  );
});

describe("user list search and filters (ticket 03)", () => {
  const PREFIX = `${RUN}-f-`;
  const EMAIL_F_ADMIN = `${PREFIX}admin@example.com`;
  const EMAIL_F_BANNED = `${PREFIX}banned@example.com`;
  const EMAIL_F_ACTIVE = `${PREFIX}active@example.com`;
  let adminCookie: string;

  async function listEmails(query: string): Promise<string[]> {
    const res = await app.request(
      `/api/auth/admin/list-users?searchField=email&searchOperator=starts_with&searchValue=${PREFIX}&${query}`,
      { headers: { Cookie: adminCookie } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { email: string }[] };
    return body.users.map((u) => u.email).sort();
  }

  test(
    "setup: an Admin, a banned user, and an active user",
    async () => {
      adminCookie = await signUp(EMAIL_F_ADMIN, "Filter Admin");
      const bannedCookie = await signUp(EMAIL_F_BANNED, "Banned One");
      await signUp(EMAIL_F_ACTIVE, "Active One");
      await db.execute(
        sql`UPDATE "user" SET role = 'admin' WHERE email = ${EMAIL_F_ADMIN}`
      );
      const bannedId = (await sessionUser(bannedCookie)).id;
      const ban = await adminPost("ban-user", adminCookie, { userId: bannedId });
      expect(ban.status).toBe(200);
    },
    TIMEOUT
  );

  test(
    "search alone scopes by email prefix",
    async () => {
      expect(await listEmails("limit=10")).toEqual(
        [EMAIL_F_ACTIVE, EMAIL_F_ADMIN, EMAIL_F_BANNED].sort()
      );
    },
    TIMEOUT
  );

  test(
    "the banned filter composes with search over the query string",
    async () => {
      expect(
        await listEmails("filterField=banned&filterOperator=eq&filterValue=true")
      ).toEqual([EMAIL_F_BANNED]);
    },
    TIMEOUT
  );

  test(
    "the role filter composes with search over the query string",
    async () => {
      expect(
        await listEmails("filterField=role&filterOperator=eq&filterValue=admin")
      ).toEqual([EMAIL_F_ADMIN]);
    },
    TIMEOUT
  );
});

describe("create and edit users (ticket 04)", () => {
  const EMAIL_C_ADMIN = `${RUN}-c-admin@example.com`;
  const EMAIL_CREATED = `${RUN}-c-created@example.com`;
  let adminCookie: string;
  let adminId: string;
  let createdId: string;

  test(
    "setup: a promoted Admin",
    async () => {
      adminCookie = await signUp(EMAIL_C_ADMIN, "Creator Admin");
      await db.execute(
        sql`UPDATE "user" SET role = 'admin' WHERE email = ${EMAIL_C_ADMIN}`
      );
      adminId = (await sessionUser(adminCookie)).id;
    },
    TIMEOUT
  );

  test(
    "an Admin can create a user who can then sign in with the chosen password",
    async () => {
      const res = await adminPost("create-user", adminCookie, {
        email: EMAIL_CREATED,
        password: PASSWORD,
        name: "Created User",
        role: "user",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { id: string; role: string } };
      expect(body.user.role).toBe("user");
      createdId = body.user.id;

      const signIn = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ email: EMAIL_CREATED, password: PASSWORD }),
      });
      expect(signIn.status).toBe(200);
    },
    TIMEOUT
  );

  test(
    "an Admin can change another user's Role in both directions",
    async () => {
      const promote = await adminPost("set-role", adminCookie, {
        userId: createdId,
        role: "admin",
      });
      expect(promote.status).toBe(200);
      const promoted = (await promote.json()) as { user: { role: string } };
      expect(promoted.user.role).toBe("admin");

      const demote = await adminPost("set-role", adminCookie, {
        userId: createdId,
        role: "user",
      });
      expect(demote.status).toBe(200);
      const demoted = (await demote.json()) as { user: { role: string } };
      expect(demoted.user.role).toBe("user");
    },
    TIMEOUT
  );

  test(
    "creation and role changes land in the audit log with their target",
    async () => {
      const raw = (await db.execute(
        sql`SELECT action, meta FROM audit_logs WHERE user_id = ${adminId} ORDER BY id`
      )) as unknown as { action: string; meta: unknown }[];
      // drizzle 0.29 + postgres.js stores jsonb params double-encoded, so
      // meta comes back as a JSON string — parse before asserting.
      const rows = raw.map((r) => ({
        action: r.action,
        meta: (typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta) as {
          target?: string;
        } | null,
      }));
      const actions = rows.map((r) => r.action);
      expect(actions).toContain("user_created");
      expect(actions).toContain("user_role_changed");
      const created = rows.find((r) => r.action === "user_created");
      expect(created?.meta?.target).toBe(EMAIL_CREATED);
      const roleChanged = rows.find((r) => r.action === "user_role_changed");
      expect(roleChanged?.meta?.target).toBe(createdId);
    },
    TIMEOUT
  );
});

describe("ban and unban (ticket 05)", () => {
  const EMAIL_B_ADMIN = `${RUN}-b-admin@example.com`;
  const EMAIL_B_TARGET = `${RUN}-b-target@example.com`;
  let adminCookie: string;
  let adminId: string;
  let targetCookie: string;
  let targetId: string;

  test(
    "setup: an Admin and a target with a live session",
    async () => {
      adminCookie = await signUp(EMAIL_B_ADMIN, "Ban Admin");
      await db.execute(
        sql`UPDATE "user" SET role = 'admin' WHERE email = ${EMAIL_B_ADMIN}`
      );
      adminId = (await sessionUser(adminCookie)).id;
      targetCookie = await signUp(EMAIL_B_TARGET, "Ban Target");
      targetId = (await sessionUser(targetCookie)).id;

      // the target's session works before the ban
      const before = await app.request("/api/expenses", {
        headers: { Cookie: targetCookie },
      });
      expect(before.status).toBe(200);
    },
    TIMEOUT
  );

  test(
    "ban kills the live session immediately and blocks sign-in distinctly",
    async () => {
      const ban = await adminPost("ban-user", adminCookie, {
        userId: targetId,
      });
      expect(ban.status).toBe(200);

      // the existing session is dead — cookie cache is off, so instantly
      const after = await app.request("/api/expenses", {
        headers: { Cookie: targetCookie },
      });
      expect(after.status).toBe(401);

      // and a fresh sign-in is refused with the banned code, not a generic 401
      const signIn = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ email: EMAIL_B_TARGET, password: PASSWORD }),
      });
      expect(signIn.status).toBe(403);
      const body = (await signIn.json()) as { code?: string };
      expect(body.code).toBe("BANNED_USER");
    },
    TIMEOUT
  );

  test(
    "unban restores sign-in",
    async () => {
      const unban = await adminPost("unban-user", adminCookie, {
        userId: targetId,
      });
      expect(unban.status).toBe(200);

      const signIn = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ email: EMAIL_B_TARGET, password: PASSWORD }),
      });
      expect(signIn.status).toBe(200);
    },
    TIMEOUT
  );

  test(
    "ban and unban land in the audit log with their target",
    async () => {
      const raw = (await db.execute(
        sql`SELECT action, meta FROM audit_logs WHERE user_id = ${adminId} ORDER BY id`
      )) as unknown as { action: string; meta: unknown }[];
      const rows = raw.map((r) => ({
        action: r.action,
        meta: (typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta) as {
          target?: string;
        } | null,
      }));
      const banned = rows.find((r) => r.action === "user_banned");
      const unbanned = rows.find((r) => r.action === "user_unbanned");
      expect(banned?.meta?.target).toBe(targetId);
      expect(unbanned?.meta?.target).toBe(targetId);
    },
    TIMEOUT
  );
});
