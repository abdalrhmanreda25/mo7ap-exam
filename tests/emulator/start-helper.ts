import type { Firestore } from "firebase-admin/firestore";

/** Starts an exam the way a student does: with the exam's access code, generating one first if the exam has none. */
export async function startWithCode(db: Firestore, studentId: string, examId: string): Promise<string> {
  const exams = await import("@/features/exams/service");
  const attempts = await import("@/features/attempts/service");
  const code = (await exams.getAccessCode(db, examId)) ?? (await exams.generateAccessCode(db, "test-admin", examId));
  return attempts.startExam(db, studentId, examId, code);
}
