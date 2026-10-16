import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin-core";
import { isRole, type Role } from "./roles";

/**
 * Trusted account administration. Only callable from server code or the local
 * admin CLI (scripts/admin-cli.ts), which runs with Admin credentials.
 * Nothing here is reachable from a browser request without a verified admin.
 */

export interface ProvisionResult {
  uid: string;
  created: boolean;
  role: Role;
  passwordSetupLink: string | null;
}

export async function provisionUser(input: {
  email: string;
  displayName: string;
  role: Role;
  actorUid: string;
}): Promise<ProvisionResult> {
  if (!isRole(input.role)) throw new Error(`Invalid role: ${input.role}`);

  const auth = getAdminAuth();
  const db = getAdminDb();
  const email = input.email.trim().toLowerCase();

  let created = false;
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
  } catch {
    const createdUser = await auth.createUser({
      email,
      displayName: input.displayName,
      emailVerified: false,
    });
    uid = createdUser.uid;
    created = true;
  }

  const userRef = db.collection("users").doc(uid);
  const existingProfile = await userRef.get();
  const previousRole = existingProfile.data()?.role as string | undefined;

  await auth.setCustomUserClaims(uid, { role: input.role });
  await userRef.set(
    {
      uid,
      displayName: input.displayName,
      email,
      role: input.role,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existingProfile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  // Role change: revoke refresh tokens so the next session picks up new claims.
  if (previousRole && previousRole !== input.role) {
    await auth.revokeRefreshTokens(uid);
  }

  await writeAuditLog(db, {
    actorUid: input.actorUid,
    action: created ? "USER_PROVISIONED" : "USER_ROLE_SET",
    targetType: "user",
    targetId: uid,
    metadata: { role: input.role, previousRole: previousRole ?? null },
  });

  const passwordSetupLink = created ? await auth.generatePasswordResetLink(email) : null;
  return { uid, created, role: input.role, passwordSetupLink };
}

export async function setUserActive(input: {
  email: string;
  active: boolean;
  actorUid: string;
}): Promise<{ uid: string; active: boolean }> {
  const auth = getAdminAuth();
  const db = getAdminDb();
  const email = input.email.trim().toLowerCase();

  const userRecord = await auth.getUserByEmail(email);
  await auth.updateUser(userRecord.uid, { disabled: !input.active });
  if (!input.active) {
    await auth.revokeRefreshTokens(userRecord.uid);
  }

  await db
    .collection("users")
    .doc(userRecord.uid)
    .set({ isActive: input.active, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  await writeAuditLog(db, {
    actorUid: input.actorUid,
    action: input.active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    targetType: "user",
    targetId: userRecord.uid,
    metadata: {},
  });

  return { uid: userRecord.uid, active: input.active };
}

async function writeAuditLog(
  db: ReturnType<typeof getAdminDb>,
  entry: {
    actorUid: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata: Record<string, unknown>;
  },
) {
  await db.collection("auditLogs").add({
    actorUid: entry.actorUid,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason ?? null,
    metadata: entry.metadata,
    timestamp: FieldValue.serverTimestamp(),
  });
}
