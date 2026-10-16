import "server-only";

import { ZodError } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import type { ActionResult } from "./action-result";
import { DomainError } from "./errors";

/**
 * Wrapper for every admin server action. Server actions are public POST endpoints,
 * so the role check happens here on every call, not only in the page layout.
 * Errors become typed results. Stack traces and raw Firestore messages never reach the client.
 */
export async function runAdminAction<T>(
  task: (actorUid: string) => Promise<T>,
): Promise<ActionResult<T>> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { ok: false, message: "ليست لديك صلاحية لتنفيذ هذا الإجراء." };
  }

  try {
    return { ok: true, data: await task(user.uid) };
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, message: "بعض البيانات غير صالحة.", fieldErrors };
    }
    if (error instanceof DomainError) {
      return { ok: false, message: error.message, issues: error.issues };
    }
    console.error(
      JSON.stringify({ level: "error", scope: "admin-action", errorName: error instanceof Error ? error.name : "unknown" }),
    );
    return { ok: false, message: "حدث خطأ غير متوقع. حاول مرة أخرى." };
  }
}
