import { db } from "../db";
import { auditLogs } from "../db/schema/auth";

export type AuditAction =
  | "register"
  | "login_success"
  | "login_failed"
  | "logout"
  | "logout_all"
  | "password_changed"
  | "password_reset"
  // Admin actions (user_id = the acting Admin; meta.target = who it hit)
  | "user_created"
  | "user_role_changed"
  | "user_banned"
  | "user_unbanned"
  | "user_deleted";

/** Best-effort audit trail — an audit failure never breaks the request. */
export async function audit(entry: {
  action: AuditAction;
  userId?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action: entry.action,
      userId: entry.userId ?? null,
      ip: entry.ip ?? null,
      meta: entry.meta ?? null,
    });
  } catch (e) {
    console.error("[audit] failed to record", entry.action, e);
  }
}
