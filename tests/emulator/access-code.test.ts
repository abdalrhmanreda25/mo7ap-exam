import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb } = await import("@/lib/firebase/admin-core");
const curriculum = await import("@/features/curriculum/service");
const questions = await import("@/features/questions/service");
const exams = await import("@/features/exams/service");
const attempts = await import("@/features/attempts/service");

const db = getAdminDb();
const ADMIN = "test-admin";

async function publishedExam() {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const subjectId = await curriculum.createSubject(db, ADMIN, {
    name: "C", nameAr: "ك", slug: `code-${tag}`, description: "", academicYear: "2026", curriculum: "x",
    applicableTracks: [], order: 1, isActive: true,
  });
  const chapterId = await curriculum.createChapter(db, ADMIN, { subjectId, title: "c", titleAr: "ف", description: "", order: 1, isActive: true });
  const lessonId = await curriculum.createLesson(db, ADMIN, { subjectId, chapterId, title: "l", titleAr: "د", order: 1, isActive: true });
  const q = await questions.createQuestion(db, ADMIN, {
    subjectId, chapterId, lessonId, type: "SINGLE_CHOICE", statement: `q-${tag}`, statementAr: `q-${tag}`,
    mediaReferences: [], difficulty: "EASY", explanation: "", explanationAr: "", status: "READY",
    options: [{ id: "a", text: "A", textAr: "أ", order: 1 }, { id: "b", text: "B", textAr: "ب", order: 2 }],
    correctOptionId: "a",
  });
  const examId = await exams.createDraftExam(db, ADMIN, {
    title: "E", titleAr: "ام", description: "", subjectId, chapterIds: [], lessonIds: [], academicYear: "2026",
    durationSeconds: 600, shuffleQuestions: false, shuffleOptions: false,
    showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false,
  });
  await exams.addQuestionToExam(db, ADMIN, examId, q, 1);
  await exams.publishExam(db, ADMIN, examId);
  return examId;
}

const attemptExists = async (examId: string, studentId: string) =>
  (await db.collection("attempts").doc(`${examId}__${studentId}`).get()).exists;

describe("exam access codes (Firestore emulator)", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
  });

  it("blocks starting until the admin generates a code", async () => {
    const examId = await publishedExam();
    expect(await exams.getAccessCode(db, examId)).toBeNull();
    await expect(attempts.startExam(db, "code-s1", examId, "ABC234")).rejects.toThrow("لم يتم إنشاء كود");
    expect(await attemptExists(examId, "code-s1")).toBe(false);
  });

  it("rejects a wrong code and accepts the right one in any case or spacing", async () => {
    const examId = await publishedExam();
    const code = await exams.generateAccessCode(db, ADMIN, examId);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(await exams.getAccessCode(db, examId)).toBe(code);

    await expect(attempts.startExam(db, "code-s2", examId, "WRONG1")).rejects.toThrow("الكود غير صحيح");
    expect(await attemptExists(examId, "code-s2")).toBe(false);

    const typed = ` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} `;
    const attemptId = await attempts.startExam(db, "code-s2", examId, typed);
    expect(await attemptExists(examId, "code-s2")).toBe(true);
    expect(attemptId).toBe(`${examId}__code-s2`);
  });

  it("a new code replaces the old one, and a started student resumes without any code", async () => {
    const examId = await publishedExam();
    const first = await exams.generateAccessCode(db, ADMIN, examId);
    const attemptId = await attempts.startExam(db, "code-s3", examId, first);

    const second = await exams.generateAccessCode(db, ADMIN, examId);
    expect(second).not.toBe(first);
    await expect(attempts.startExam(db, "code-s4", examId, first)).rejects.toThrow("الكود غير صحيح");
    expect(await attempts.startExam(db, "code-s4", examId, second)).toBe(`${examId}__code-s4`);

    // Refresh or reopening the page mid-exam must never ask for the code again.
    expect(await attempts.startExam(db, "code-s3", examId, "")).toBe(attemptId);
  });

  it("refuses to generate a code for a missing exam", async () => {
    await expect(exams.generateAccessCode(db, ADMIN, "no-such-exam")).rejects.toThrow("الامتحان غير موجود");
  });
});
