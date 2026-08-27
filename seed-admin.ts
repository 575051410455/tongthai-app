import { sql } from "drizzle-orm";

import { auth } from "./server/lib/auth";
import { db } from "./server/db";

/**
 * First-admin bootstrap (ticket 02): every role system has a chicken-and-egg —
 * this script hatches it. Idempotent: creates the account if missing (verified,
 * role admin), promotes it if it exists, does nothing if it's already an Admin.
 * Creation goes through auth.api.createUser, so the password is hashed by the
 * configured argon2id hasher and the Registration toggle is irrelevant.
 *
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=... bun run seed:admin
 */

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME?.trim() || "Admin";

if (!email || !password) {
  console.error(
    "[seed:admin] SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required"
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("[seed:admin] SEED_ADMIN_PASSWORD must be at least 8 characters");
  process.exit(1);
}

const existing = (await db.execute(
  sql`SELECT id, role FROM "user" WHERE email = ${email}`
)) as unknown as { id: string; role: string }[];

if (existing.length > 0) {
  const user = existing[0]!;
  if (user.role === "admin") {
    console.log(`[seed:admin] ${email} is already an Admin — nothing to do`);
  } else {
    await db.execute(
      sql`UPDATE "user" SET role = 'admin', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${user.id}`
    );
    console.log(`[seed:admin] promoted existing account ${email} to Admin`);
  }
} else {
  // Server-side call with no headers: better-auth treats it as a trusted
  // system call (no session required), exactly what a bootstrap needs.
  await auth.api.createUser({
    body: {
      email,
      password,
      name,
      role: "admin",
      data: { emailVerified: true },
    },
  });
  console.log(`[seed:admin] created Admin ${email}`);
}

// The pg/postgres pools would keep the event loop alive forever
process.exit(0);
