import type { Firestore } from "firebase-admin/firestore";

/** Starts an exam (in the main space) the way a student does: with its access code, generated first if missing. */
export async function startWithCode(db: Firestore, studentId: string, examId: string): Promise<string> {
  const exams = await import("@/features/exams/service");
  const attempts = await import("@/features/attempts/service");
  const admin = { uid: "test-admin", workspaceId: "main" };
  const code = (await exams.getAccessCode(db, admin.workspaceId, examId)) ?? (await exams.generateAccessCode(db, admin, examId));
  return attempts.startExam(db, studentId, examId, code);
}
