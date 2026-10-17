import "server-only";

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebase/admin";
import { auditLogWrite } from "@/lib/audit/log";
import { DomainError } from "@/lib/server/errors";
import { COLLECTIONS, type AttemptStatus } from "@/types/firestore";

export interface StudentRow {
  uid: string;
  displayName: string;
  email: string;
  isActive: boolean;
  attempts: number;
  completed: number;
  inProgress: number;
}

export interface StudentAttemptRow {
  attemptId: string;
  examId: string;
  examTitleAr: string;
  status: AttemptStatus;
  score: number | null;
  maxScore: number;
  superseded: boolean;
  fullscreenExits: number;
  submittedAtMs: number | null;
}

export async function listStudents(db: Firestore): Promise<StudentRow[]> {
  const [users, attempts] = await Promise.all([
    db.collection(COLLECTIONS.users).where("role", "==", "STUDENT").get(),
    db.collection(COLLECTIONS.attempts).get(),
  ]);
  const byStudent = new Map<string, { total: number; completed: number; inProgress: number }>();
  for (const a of attempts.docs) {
    const d = a.data();
    if (d.superseded) continue;
    const row = byStudent.get(d.studentId) ?? { total: 0, completed: 0, inProgress: 0 };
    row.total++;
    if (d.status === "IN_PROGRESS") row.inProgress++;
    else row.completed++;
    byStudent.set(d.studentId, row);
  }
  return users.docs
    .map((doc) => {
      const d = doc.data();
      const counts = byStudent.get(doc.id) ?? { total: 0, completed: 0, inProgress: 0 };
      return {
        uid: doc.id,
        displayName: d.displayName ?? "",
        email: d.email ?? "",
        isActive: d.isActive === true,
        attempts: counts.total,
        completed: counts.completed,
        inProgress: counts.inProgress,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
}

export async function getStudent(db: Firestore, uid: string) {
  const snap = await db.collection(COLLECTIONS.users).doc(uid).get();
  if (!snap.exists || snap.data()!.role !== "STUDENT") return null;
  const d = snap.data()!;
  return { uid, displayName: d.displayName ?? "", email: d.email ?? "", isActive: d.isActive === true };
}

export async function listStudentAttempts(db: Firestore, uid: string): Promise<StudentAttemptRow[]> {
  const snap = await db.collection(COLLECTIONS.attempts).where("studentId", "==", uid).get();
  const examIds = [...new Set(snap.docs.map((d) => d.data().examId as string))];
  const exams = await Promise.all(examIds.map((id) => db.collection(COLLECTIONS.exams).doc(id).get()));
  const title = new Map(exams.map((e) => [e.id, (e.data()?.titleAr as string) ?? "امتحان محذوف"]));
  return snap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        attemptId: doc.id,
        examId: d.examId,
        examTitleAr: title.get(d.examId) ?? "امتحان",
        status: d.status,
        score: d.score ?? null,
        maxScore: d.maxScore ?? 0,
        superseded: d.superseded === true,
        fullscreenExits: d.fullscreenExits ?? 0,
        submittedAtMs: d.submittedAt ? (d.submittedAt as Timestamp).toMillis() : null,
      };
    })
    .sort((a, b) => (b.submittedAtMs ?? Number.MAX_SAFE_INTEGER) - (a.submittedAtMs ?? Number.MAX_SAFE_INTEGER));
}

/**
 * Lets a student take an exam again. The finished attempt, its answers, and its result are moved to
 * versioned history IDs ({attemptId}__v{n}) and marked superseded. Nothing is lost. The original
 * deterministic attempt ID becomes free, so startExam creates a new attempt.
 * Refused while the attempt is still in progress.
 */
export async function reopenAttempt(db: Firestore, actorUid: string, attemptId: string, reason: string): Promise<string> {
  if (attemptId.includes("__v")) throw new DomainError("هذه نسخة محفوظة من محاولة سابقة، وليست المحاولة الحالية.");
  const attemptRef = db.collection(COLLECTIONS.attempts).doc(attemptId);
  const resultRef = db.collection(COLLECTIONS.results).doc(attemptId);

  const archiveId = await db.runTransaction(async (tx) => {
    const attempt = await tx.get(attemptRef);
    if (!attempt.exists) throw new DomainError("لا توجد محاولة لهذا الطالب في هذا الامتحان.");
    const data = attempt.data()!;
    if (data.status === "IN_PROGRESS") throw new DomainError("المحاولة ما زالت جارية. انتظر حتى تنتهي.");

    const versions = await tx.get(
      db.collection(COLLECTIONS.attempts).where("examId", "==", data.examId).where("studentId", "==", data.studentId),
    );
    const archiveId = `${attemptId}__v${versions.size}`;
    const [answers, result] = await Promise.all([tx.get(attemptRef.collection(COLLECTIONS.attemptAnswers)), tx.get(resultRef)]);

    const now = Timestamp.fromMillis(Date.now());
    const archiveRef = db.collection(COLLECTIONS.attempts).doc(archiveId);
    tx.set(archiveRef, { ...data, superseded: true, supersededAt: now, supersededBy: actorUid, reopenReason: reason, originalAttemptId: attemptId });
    for (const a of answers.docs) {
      tx.set(archiveRef.collection(COLLECTIONS.attemptAnswers).doc(a.id), a.data());
      tx.delete(a.ref);
    }
    if (result.exists) {
      tx.set(db.collection(COLLECTIONS.results).doc(archiveId), { ...result.data(), attemptId: archiveId, superseded: true, supersededAt: now });
      tx.delete(resultRef);
    }
    tx.delete(attemptRef);

    const audit = auditLogWrite(db, actorUid, {
      action: "EXAM_REOPENED_FOR_STUDENT",
      targetType: "attempt",
      targetId: attemptId,
      reason,
      metadata: { examId: data.examId, studentId: data.studentId, previousScore: data.score ?? null, archivedAs: archiveId },
    });
    tx.set(audit.ref, audit.data);
    return archiveId;
  });

  // Camera signaling for the old attempt is meaningless now. Remove it.
  await db.recursiveDelete(db.collection("monitorSessions").doc(attemptId));
  return archiveId;
}

/** Reopens every finished, current attempt of an exam. In-progress attempts are left alone. */
export async function reopenExamForAll(db: Firestore, actorUid: string, examId: string, reason: string) {
  const exam = await db.collection(COLLECTIONS.exams).doc(examId).get();
  if (!exam.exists) throw new DomainError("الامتحان غير موجود.");
  const snap = await db.collection(COLLECTIONS.attempts).where("examId", "==", examId).get();
  const targets = snap.docs.filter((d) => !d.data().superseded && d.data().status !== "IN_PROGRESS");
  let reopened = 0;
  for (const t of targets) {
    await reopenAttempt(db, actorUid, t.id, reason);
    reopened++;
  }
  const skipped = snap.docs.filter((d) => !d.data().superseded && d.data().status === "IN_PROGRESS").length;
  return { reopened, skipped, closed: exam.data()!.status !== "PUBLISHED" };
}

export async function setStudentActive(db: Firestore, actorUid: string, uid: string, active: boolean) {
  const student = await getStudent(db, uid);
  if (!student) throw new DomainError("الطالب غير موجود.");
  const auth = getAdminAuth();
  await auth.updateUser(uid, { disabled: !active });
  if (!active) await auth.revokeRefreshTokens(uid);
  const audit = auditLogWrite(db, actorUid, {
    action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    targetType: "user",
    targetId: uid,
  });
  const batch = db.batch();
  batch.update(db.collection(COLLECTIONS.users).doc(uid), { isActive: active, updatedAt: FieldValue.serverTimestamp() });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}
