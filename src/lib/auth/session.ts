import "server-only";

import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isRole, type Role } from "./roles";
import { SESSION_COOKIE_NAME } from "./session-config";
import { workspaceOf, type Actor } from "@/lib/workspace";
import { ensureWorkspacesMigrated } from "@/lib/workspace/migrate";

export interface SessionUser {
  uid: string;
  role: Role;
  email: string | null;
  displayName: string;
  /** The teacher space this user belongs to. */
  workspaceId: string;
}

/**
 * Resolves the current user from the session cookie.
 *
 * Trust chain:
 *  - Cookie verified by Admin SDK with checkRevoked=true. Disabled Auth users
 *    and revoked sessions fail here.
 *  - Role read from the custom claim, which only trusted admin code can set.
 *  - users/{uid} must exist with isActive=true. Deactivation takes effect
 *    even if the Auth-side disable step is skipped.
 *
 * Returns null for any failure. Callers decide what null means.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  // Request-time only. The Admin SDK reads the clock during verification, which must not be prerendered.
  await connection();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    if (!isRole(decoded.role)) return null;

    const db = getAdminDb();
    await ensureWorkspacesMigrated(db);
    const profileSnap = await db.collection("users").doc(decoded.uid).get();
    const profile = profileSnap.data();
    if (!profileSnap.exists || profile?.isActive !== true || profile?.role !== decoded.role) {
      return null;
    }

    return {
      uid: decoded.uid,
      role: decoded.role,
      email: decoded.email ?? null,
      displayName: typeof profile.displayName === "string" ? profile.displayName : "",
      workspaceId: workspaceOf(profile),
    };
  } catch {
    return null;
  }
}

/**
 * Page-level guard. Layouts and pages run this on every request.
 * It is not sufficient alone. Every privileged data access must re-check.
 */
/** The signed-in teacher as the actor every admin service call takes. */
export async function requireAdmin(): Promise<SessionUser & Actor> {
  return requireRole("ADMIN");
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect("/unauthorized");
  return user;
}
