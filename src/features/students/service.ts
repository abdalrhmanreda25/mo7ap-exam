import "server-only";

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebase/admin";
import { auditLogWrite } from "@/lib/audit/log";
import { DomainError } from "@/lib/server/errors";
import { COLLECTIONS, type AttemptStatus } from "@/types/firestore";
import { settleExpiredAttempts } from "@/features/attempts/service";
import { gradeOf, type GradeId } from "@/lib/grades";
import { assertInWorkspace, inWorkspace, type Actor } from "@/lib/workspace";

export interface StudentRow {
  uid: string;
  displayName: string;
  email: string;
  isActive: boolean;
  grade: GradeId;
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

export async function listStudents(db: Firestore, workspaceId: string): Promise<StudentRow[]> {
  await settleExpiredAttempts(db, { workspaceId });
  const [users, attempts] = await Promise.all([
    db.collection(COLLECTIONS.users).where("workspaceId", "==", workspaceId).where("role", "==", "STUDENT").get(),
    db.collection(COLLECTIONS.attempts).where("workspaceId", "==", workspaceId).get(),
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
        grade: gradeOf(d.grade),
        attempts: counts.total,
        completed: counts.completed,
        inProgress: counts.inProgress,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
}

export async function getStudent(db: Firestore, workspaceId: string, uid: string) {
  const snap = await db.collection(COLLECTIONS.users).doc(uid).get();
  if (!inWorkspace(snap.data(), workspaceId) || snap.data()!.role !== "STUDENT") return null;
  const d = snap.data()!;
  return { uid, displayName: d.displayName ?? "", email: d.email ?? "", isActive: d.isActive === true, grade: gradeOf(d.grade) };
}

/** The student's school year. A student without a profile year is third secondary. */
export async function getStudentGrade(db: Firestore, uid: string): Promise<GradeId> {
  return gradeOf((await db.collection(COLLECTIONS.users).doc(uid).get()).data()?.grade);
}

/** A teacher adds a student account, in the teacher's space, with a password and a school year. */
export async function createStudent(
  db: Firestore,
  actor: Actor,
  input: { displayName: string; email: string; password: string; grade: GradeId },
): Promise<string> {
  const auth = getAdminAuth();
  const email = input.email.trim().toLowerCase();
  let uid: string;
  try {
    uid = (await auth.createUser({ email, password: input.password, displayName: input.displayName })).uid;
  } catch (error) {
    throw accountError(error);
  }
  await auth.setCustomUserClaims(uid, { role: "STUDENT" });

  const audit = auditLogWrite(db, actor, {
    action: "STUDENT_CREATED",
    targetType: "user",
    targetId: uid,
    // Never log the password itself.
    metadata: { email, grade: input.grade },
  });
  const batch = db.batch();
  batch.set(db.collection(COLLECTIONS.users).doc(uid), {
    uid,
    displayName: input.displayName,
    email,
    role: "STUDENT",
    isActive: true,
    grade: input.grade,
    workspaceId: actor.workspaceId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return uid;
}

function accountError(error: unknown): unknown {
  const code = (error as { code?: string }).code ?? "";
  if (code.includes("email-already-exists")) return new DomainError("هذا البريد مستخدم لحساب آخر.");
  if (code.includes("invalid-password")) return new DomainError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
  if (code.includes("invalid-email")) return new DomainError("البريد الإلكتروني غير صالح.");
  return error;
}

export async function listStudentAttempts(db: Firestore, workspaceId: string, uid: string): Promise<StudentAttemptRow[]> {
  if (!(await getStudent(db, workspaceId, uid))) return [];
  await settleExpiredAttempts(db, { studentId: uid });
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
export async function reopenAttempt(db: Firestore, actor: Actor, attemptId: string, reason: string): Promise<string> {
  if (attemptId.includes("__v")) throw new DomainError("هذه نسخة محفوظة من محاولة سابقة، وليست المحاولة الحالية.");
  await settleExpiredAttempts(db, { workspaceId: actor.workspaceId });
  const attemptRef = db.collection(COLLECTIONS.attempts).doc(attemptId);
  const resultRef = db.collection(COLLECTIONS.results).doc(attemptId);

  const archiveId = await db.runTransaction(async (tx) => {
    const attempt = await tx.get(attemptRef);
    const data = attempt.data();
    assertInWorkspace(data, actor.workspaceId, "المحاولة غير موجودة.");
    if (data.status === "IN_PROGRESS") throw new DomainError("المحاولة ما زالت جارية. انتظر حتى تنتهي.");

    const versions = await tx.get(
      db.collection(COLLECTIONS.attempts).where("examId", "==", data.examId).where("studentId", "==", data.studentId),
    );
    const archiveId = `${attemptId}__v${versions.size}`;
    const [answers, result] = await Promise.all([tx.get(attemptRef.collection(COLLECTIONS.attemptAnswers)), tx.get(resultRef)]);

    const now = Timestamp.fromMillis(Date.now());
    const archiveRef = db.collection(COLLECTIONS.attempts).doc(archiveId);
    tx.set(archiveRef, { ...data, superseded: true, supersededAt: now, supersededBy: actor.uid, reopenReason: reason, originalAttemptId: attemptId });
    for (const a of answers.docs) {
      tx.set(archiveRef.collection(COLLECTIONS.attemptAnswers).doc(a.id), a.data());
      tx.delete(a.ref);
    }
    if (result.exists) {
      tx.set(db.collection(COLLECTIONS.results).doc(archiveId), { ...result.data(), attemptId: archiveId, superseded: true, supersededAt: now });
      tx.delete(resultRef);
    }
    tx.delete(attemptRef);

    const audit = auditLogWrite(db, actor, {
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
export async function reopenExamForAll(db: Firestore, actor: Actor, examId: string, reason: string) {
  await settleExpiredAttempts(db, { workspaceId: actor.workspaceId });
  const exam = await db.collection(COLLECTIONS.exams).doc(examId).get();
  assertInWorkspace(exam.data(), actor.workspaceId, "الامتحان غير موجود.");
  const snap = await db.collection(COLLECTIONS.attempts).where("examId", "==", examId).get();
  const targets = snap.docs.filter((d) => !d.data().superseded && d.data().status !== "IN_PROGRESS");
  let reopened = 0;
  for (const t of targets) {
    await reopenAttempt(db, actor, t.id, reason);
    reopened++;
  }
  const skipped = snap.docs.filter((d) => !d.data().superseded && d.data().status === "IN_PROGRESS").length;
  return { reopened, skipped, closed: exam.data()!.status !== "PUBLISHED" };
}

export async function setStudentActive(db: Firestore, actor: Actor, uid: string, active: boolean) {
  const student = await getStudent(db, actor.workspaceId, uid);
  if (!student) throw new DomainError("الطالب غير موجود.");
  const auth = getAdminAuth();
  await auth.updateUser(uid, { disabled: !active });
  if (!active) await auth.revokeRefreshTokens(uid);
  const audit = auditLogWrite(db, actor, {
    action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    targetType: "user",
    targetId: uid,
  });
  const batch = db.batch();
  batch.update(db.collection(COLLECTIONS.users).doc(uid), { isActive: active, updatedAt: FieldValue.serverTimestamp() });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}

export interface StudentExamStat {
  attemptId: string;
  examTitleAr: string;
  subjectNameAr: string;
  score: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  blank: number;
  durationMinutes: number | null;
  fullscreenExits: number;
  submittedAtMs: number | null;
}

export interface StudentStats {
  completed: number;
  inProgress: number;
  averagePercentage: number | null;
  bestPercentage: number | null;
  worstPercentage: number | null;
  totalMinutes: number;
  totalCorrect: number;
  totalWrong: number;
  totalBlank: number;
  exams: StudentExamStat[];
  lessons: { lessonId: string; titleAr: string; correct: number; total: number; percentage: number }[];
  subjects: { subjectId: string; nameAr: string; exams: number; averagePercentage: number }[];
}

/** Statistics from persisted, current (non-superseded) attempts only. No estimates. */
export async function getStudentStats(db: Firestore, workspaceId: string, uid: string): Promise<StudentStats> {
  await settleExpiredAttempts(db, { studentId: uid });
  const attemptsSnap = (await getStudent(db, workspaceId, uid))
    ? await db.collection(COLLECTIONS.attempts).where("studentId", "==", uid).get()
    : { docs: [] };
  const current = attemptsSnap.docs.filter((d) => !d.data().superseded);
  const finished = current.filter((d) => d.data().status !== "IN_PROGRESS");

  const examIds = [...new Set(finished.map((d) => d.data().examId as string))];
  const [examDocs, subjectsSnap, lessonsSnap] = await Promise.all([
    Promise.all(examIds.map((id) => db.collection(COLLECTIONS.exams).doc(id).get())),
    db.collection(COLLECTIONS.subjects).where("workspaceId", "==", workspaceId).get(),
    db.collection(COLLECTIONS.lessons).where("workspaceId", "==", workspaceId).get(),
  ]);
  const examById = new Map(examDocs.map((e) => [e.id, e.data()]));
  const subjectName = new Map(subjectsSnap.docs.map((s) => [s.id, (s.data().nameAr as string) ?? ""]));
  const lessonTitle = new Map(lessonsSnap.docs.map((l) => [l.id, (l.data().titleAr as string) ?? ""]));

  const exams: StudentExamStat[] = [];
  const lessonAgg = new Map<string, { correct: number; total: number }>();
  const subjectAgg = new Map<string, number[]>();
  const bankLesson = new Map<string, string>();

  for (const attempt of finished) {
    const a = attempt.data();
    const examId = a.examId as string;
    const [answersSnap, keysSnap] = await Promise.all([
      attempt.ref.collection(COLLECTIONS.attemptAnswers).get(),
      db.collection(COLLECTIONS.examAnswerKeys).doc(examId).collection("items").get(),
    ]);
    const chosen = new Map(answersSnap.docs.map((d) => [d.id, d.data().selectedOptionId as string]));
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    for (const key of keysSnap.docs) {
      const qid = key.id;
      const pick = chosen.get(qid);
      const right = pick !== undefined && pick === key.data().correctOptionId;
      if (pick === undefined) blank++;
      else if (right) correct++;
      else wrong++;

      if (!bankLesson.has(qid)) {
        const bank = await db.collection(COLLECTIONS.questions).doc(qid).get();
        bankLesson.set(qid, (bank.data()?.lessonId as string) ?? "");
      }
      const lessonId = bankLesson.get(qid)!;
      if (lessonId) {
        const agg = lessonAgg.get(lessonId) ?? { correct: 0, total: 0 };
        agg.total++;
        if (right) agg.correct++;
        lessonAgg.set(lessonId, agg);
      }
    }

    const score = (a.score as number) ?? 0;
    const maxScore = (a.maxScore as number) ?? 0;
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
    const started = a.startedAt ? (a.startedAt as Timestamp).toMillis() : null;
    const submitted = a.submittedAt ? (a.submittedAt as Timestamp).toMillis() : null;
    const subjectId = (a.subjectId as string) ?? (examById.get(examId)?.subjectId as string) ?? "";
    subjectAgg.set(subjectId, [...(subjectAgg.get(subjectId) ?? []), percentage]);

    exams.push({
      attemptId: attempt.id,
      examTitleAr: (examById.get(examId)?.titleAr as string) ?? "امتحان محذوف",
      subjectNameAr: subjectName.get(subjectId) ?? "",
      score,
      maxScore,
      percentage,
      correct,
      wrong,
      blank,
      durationMinutes: started && submitted ? Math.max(0, Math.round((submitted - started) / 60000)) : null,
      fullscreenExits: (a.fullscreenExits as number) ?? 0,
      submittedAtMs: submitted,
    });
  }

  exams.sort((x, y) => (y.submittedAtMs ?? 0) - (x.submittedAtMs ?? 0));
  const pcts = exams.map((e) => e.percentage);
  const avg = pcts.length ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10 : null;

  return {
    completed: finished.length,
    inProgress: current.length - finished.length,
    averagePercentage: avg,
    bestPercentage: pcts.length ? Math.max(...pcts) : null,
    worstPercentage: pcts.length ? Math.min(...pcts) : null,
    totalMinutes: exams.reduce((s, e) => s + (e.durationMinutes ?? 0), 0),
    totalCorrect: exams.reduce((s, e) => s + e.correct, 0),
    totalWrong: exams.reduce((s, e) => s + e.wrong, 0),
    totalBlank: exams.reduce((s, e) => s + e.blank, 0),
    exams,
    lessons: [...lessonAgg.entries()]
      .map(([lessonId, v]) => ({
        lessonId,
        titleAr: lessonTitle.get(lessonId) ?? "درس",
        correct: v.correct,
        total: v.total,
        percentage: Math.round((v.correct / v.total) * 1000) / 10,
      }))
      .sort((x, y) => x.percentage - y.percentage),
    subjects: [...subjectAgg.entries()].map(([subjectId, list]) => ({
      subjectId,
      nameAr: subjectName.get(subjectId) ?? "",
      exams: list.length,
      averagePercentage: Math.round((list.reduce((s, p) => s + p, 0) / list.length) * 10) / 10,
    })),
  };
}

export async function updateStudent(
  db: Firestore,
  actor: Actor,
  uid: string,
  input: { displayName: string; email: string; password?: string; grade?: GradeId },
) {
  const student = await getStudent(db, actor.workspaceId, uid);
  if (!student) throw new DomainError("الطالب غير موجود.");
  const auth = getAdminAuth();
  const email = input.email.trim().toLowerCase();
  try {
    await auth.updateUser(uid, {
      displayName: input.displayName,
      email,
      ...(input.password ? { password: input.password } : {}),
    });
  } catch (error) {
    throw accountError(error);
  }
  if (input.password) await auth.revokeRefreshTokens(uid);

  const audit = auditLogWrite(db, actor, {
    action: "STUDENT_UPDATED",
    targetType: "user",
    targetId: uid,
    // Never log the password itself.
    metadata: {
      emailChanged: email !== student.email,
      nameChanged: input.displayName !== student.displayName,
      passwordChanged: Boolean(input.password),
      grade: input.grade ?? student.grade,
    },
  });
  const batch = db.batch();
  batch.update(db.collection(COLLECTIONS.users).doc(uid), {
    displayName: input.displayName,
    email,
    grade: input.grade ?? student.grade,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}

/**
 * Removes the login and profile. Attempts and results stay as history (audited).
 * Refused while the student is in the middle of an exam.
 */
export async function deleteStudent(db: Firestore, actor: Actor, uid: string) {
  const student = await getStudent(db, actor.workspaceId, uid);
  if (!student) throw new DomainError("الطالب غير موجود.");
  await settleExpiredAttempts(db, { studentId: uid });
  const active = await db.collection(COLLECTIONS.attempts).where("studentId", "==", uid).where("status", "==", "IN_PROGRESS").limit(1).get();
  if (!active.empty) throw new DomainError("الطالب في امتحان الآن. انتظر حتى ينتهي ثم احذف الحساب.");

  const audit = auditLogWrite(db, actor, {
    action: "STUDENT_DELETED",
    targetType: "user",
    targetId: uid,
    metadata: { email: student.email, displayName: student.displayName },
  });
  await audit.ref.set(audit.data);
  try {
    await getAdminAuth().deleteUser(uid);
  } catch (error) {
    if (!String((error as { code?: string }).code ?? "").includes("user-not-found")) throw error;
  }
  await db.collection(COLLECTIONS.users).doc(uid).delete();
}

export async function studentPasswordLink(db: Firestore, workspaceId: string, uid: string): Promise<string> {
  const student = await getStudent(db, workspaceId, uid);
  if (!student?.email) throw new DomainError("لا يوجد بريد لهذا الطالب.");
  return getAdminAuth().generatePasswordResetLink(student.email);
}
