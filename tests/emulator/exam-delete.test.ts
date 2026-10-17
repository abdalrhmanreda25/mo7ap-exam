import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb } = await import("@/lib/firebase/admin-core");
const curriculum = await import("@/features/curriculum/service");
const questions = await import("@/features/questions/service");
const exams = await import("@/features/exams/service");
const attempts = await import("@/features/attempts/service");

const db = getAdminDb();
const ADMIN = "test-admin";

async function examWithQuestion(published: boolean) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const subjectId = await curriculum.createSubject(db, ADMIN, {
    name: "D", nameAr: "د", slug: `del-${tag}`, description: "", academicYear: "2026", curriculum: "x",
    applicableTracks: [], order: 1, isActive: true,
  });
  const chapterId = await curriculum.createChapter(db, ADMIN, { subjectId, title: "c", titleAr: "ف", description: "", order: 1, isActive: true });
  const lessonId = await curriculum.createLesson(db, ADMIN, { subjectId, chapterId, title: "l", titleAr: "د", order: 1, isActive: true });
  const qid = await questions.createQuestion(db, ADMIN, {
    subjectId, chapterId, lessonId, type: "SINGLE_CHOICE", statement: `q-${tag}`, statementAr: `q-${tag}`,
    mediaReferences: [], difficulty: "EASY", explanation: "", explanationAr: "", status: "READY",
    options: [{ id: "a", text: "A", textAr: "A", order: 1 }, { id: "b", text: "B", textAr: "B", order: 2 }],
    correctOptionId: "b",
  });
  const examId = await exams.createDraftExam(db, ADMIN, {
    title: "D", titleAr: `حذف ${tag}`, description: "", subjectId, chapterIds: [], lessonIds: [], academicYear: "2026",
    durationSeconds: 600, shuffleQuestions: false, shuffleOptions: false,
    showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false,
  });
  await exams.addQuestionToExam(db, ADMIN, examId, qid, 1);
  if (published) await exams.publishExam(db, ADMIN, examId);
  return { examId };
}

describe("admin exam delete", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
  });

  it("deletes a draft with its question set and writes an audit entry", async () => {
    const { examId } = await examWithQuestion(false);
    await exams.deleteExam(db, ADMIN, examId);

    expect((await db.collection("exams").doc(examId).get()).exists).toBe(false);
    expect((await db.collection("exams").doc(examId).collection("questions").get()).empty).toBe(true);
    const log = await db.collection("auditLogs").where("action", "==", "EXAM_DELETED").where("targetId", "==", examId).get();
    expect(log.size).toBe(1);
  });

  it("deletes a published exam nobody has started, including its answer keys", async () => {
    const { examId } = await examWithQuestion(true);
    expect((await db.collection("examAnswerKeys").doc(examId).collection("items").get()).size).toBe(1);
    await exams.deleteExam(db, ADMIN, examId);
    expect((await db.collection("examAnswerKeys").doc(examId).collection("items").get()).empty).toBe(true);
  });

  it("refuses to delete an exam that a student has started, and keeps it intact", async () => {
    const { examId } = await examWithQuestion(true);
    await attempts.startExam(db, "student-delete-test", examId);
    await expect(exams.deleteExam(db, ADMIN, examId)).rejects.toThrow("أرشفه");
    expect((await db.collection("exams").doc(examId).get()).exists).toBe(true);
    expect(await exams.countExamAttempts(db, examId)).toBe(1);
  });
});
