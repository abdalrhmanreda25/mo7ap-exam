import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  /** Identifiers and counts only. Never tokens, passwords, or answer keys. */
  metadata?: Record<string, unknown>;
}

/**
 * Builds an audit document to be written inside the same batch or transaction as the change,
 * so a change and its audit record commit together or not at all.
 */
export function auditLogWrite(
  db: Firestore,
  actorUid: string,
  entry: AuditEntry,
): { ref: DocumentReference; data: Record<string, unknown> } {
  return {
    ref: db.collection("auditLogs").doc(),
    data: {
      actorUid,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? {},
      timestamp: FieldValue.serverTimestamp(),
    },
  };
}
