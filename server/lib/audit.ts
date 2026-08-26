import { db } from "../db";
import { auditLogs } from "../db/schema/auth";

export type AuditAction =
  | "register"
  | "login_success"
  | "logout"
  | "logout_all"
  | "password_changed"
  | "password_reset"
  | "email_verified";

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
