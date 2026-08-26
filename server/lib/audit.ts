import { type Context } from "hono";
import { db } from "../db";
import { auditLogs } from "../db/schema/auth";
import { clientIp } from "./client-ip";

export type AuditAction =
  | "register"
  | "login_success"
  | "login_failed"
  | "account_locked"
  | "refresh_rotated"
  | "refresh_reuse_detected"
  | "password_changed"
  | "logout"
  | "logout_all";

export { clientIp } from "./client-ip";

/** Best-effort audit trail — an audit failure never breaks the request. */
export async function audit(
  c: Context,
  action: AuditAction,
  userId?: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action,
      userId: userId ?? null,
      ip: clientIp(c),
      meta: meta ?? null,
    });
  } catch (e) {
    console.error("[audit] failed to record", action, e);
  }
}
