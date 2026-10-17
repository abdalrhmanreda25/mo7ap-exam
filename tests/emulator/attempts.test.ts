import { beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb } = await import("@/lib/firebase/admin-core");
const curriculum = await import("@/features/curriculum/service");
const questions = await import("@/features/questions/service");
const exams = await import("@/features/exams/service");
const attempts = await import("@/features/attempts/service");

const db = getAdminDb();
const ADMIN = "test-admin";
const STUDENT = `student-${Date.now()}`;
const OTHER = `other-${Date.now()}`;

async function publishedExam(opts: Partial<{ showCorrect: boolean; showExplanations: boolean; shuffle: boolean }> = {}) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const subjectId = await curriculum.createSubject(db, ADMIN, {
    name: "M", nameAr: "م", slug: `att-${tag}`, description: "", academicYear: "2026", curriculum: "x",
    applicableTracks: [], order: 1, isActive: true,
  });
  const chapterId = await curriculum.createChapter(db, ADMIN, { subjectId, title: "c", titleAr: "ف", description: "", order: 1, isActive: true });
  const lessonId = await curriculum.createLesson(db, ADMIN, { subjectId, chapterId, title: "l", titleAr: "د", order: 1, isActive: true });
  const base = (text: string, correct: string) => ({
    subjectId, chapterId, lessonId, type: "SINGLE_CHOICE" as const, statement: text, statementAr: text,
    mediaReferences: [], difficulty: "EASY" as const, explanation: "why", explanationAr: "لأن", status: "READY" as const,
    options: [{ id: "a", text: "A", textAr: "أ", order: 1 }, { id: "b", text: "B", textAr: "ب", order: 2 }, { id: "c", text: "C", textAr: "ج", order: 3 }],
    correctOptionId: correct,
  });
  const q1 = await questions.createQuestion(db, ADMIN, base(`q1-${tag}`, "b"));
  const q2 = await questions.createQuestion(db, ADMIN, base(`q2-${tag}`, "a"));
  const examId = await exams.createDraftExam(db, ADMIN, {
    title: "E", titleAr: "ام", description: "", subjectId, chapterIds: [], lessonIds: [], academicYear: "2026",
    durationSeconds: 600, shuffleQuestions: opts.shuffle ?? false, shuffleOptions: opts.shuffle ?? false,
    showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: opts.showCorrect ?? false, showExplanationsAfterSubmit: opts.showExplanations ?? false,
  });
  await exams.addQuestionToExam(db, ADMIN, examId, q1, 2);
  await exams.addQuestionToExam(db, ADMIN, examId, q2, 3);
  await exams.publishExam(db, ADMIN, examId);
  return { examId, q1, q2 };
}

const attemptCount = async (examId: string, studentId: string) =>
  (await db.collection("attempts").where("examId", "==", examId).where("studentId", "==", studentId).get()).size;

describe("attempt engine (Firestore emulator)", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
  });

  it("returns the same attempt on repeat starts and under concurrent starts, and creates exactly one", async () => {
    const { examId } = await publishedExam();
    const ids = await Promise.all(Array.from({ length: 5 }, () => attempts.startExam(db, STUDENT, examId)));
    expect(new Set(ids).size).toBe(1);
    expect(await attempts.startExam(db, STUDENT, examId)).toBe(ids[0]);
    expect(await attemptCount(examId, STUDENT)).toBe(1);
  });

  it("refuses to start a draft exam", async () => {
    const tag = Date.now().toString(36);
    const subjectId = await curriculum.createSubject(db, ADMIN, {
      name: "D", nameAr: "د", slug: `draft-${tag}`, description: "", academicYear: "2026", curriculum: "x",
      applicableTracks: [], order: 1, isActive: true,
    });
    const examId = await exams.createDraftExam(db, ADMIN, {
      title: "D", titleAr: "د", description: "", subjectId, chapterIds: [], lessonIds: [], academicYear: "2026",
      durationSeconds: 600, shuffleQuestions: false, shuffleOptions: false,
      showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false,
    });
    await expect(attempts.startExam(db, STUDENT, examId)).rejects.toThrow();
  });

  it("saves answers, rejects foreign options, and ignores stale sequence numbers", async () => {
    const { examId, q1 } = await publishedExam();
    const id = await attempts.startExam(db, STUDENT, examId);

    await expect(attempts.saveAnswer(db, STUDENT, id, q1, "zzz", 1)).rejects.toThrow("الخيار");
    expect((await attempts.saveAnswer(db, STUDENT, id, q1, "b", 5)).saved).toBe(true);
    expect((await attempts.saveAnswer(db, STUDENT, id, q1, "a", 3)).saved).toBe(true); // stale, ignored
    const view = await attempts.getAttemptView(db, STUDENT, id);
    expect(view?.answers[q1]).toBe("b");
  });

  it("rejects saves after the server deadline, even though the attempt is still open", async () => {
    const { examId, q1 } = await publishedExam();
    const id = await attempts.startExam(db, STUDENT, examId);
    await db.collection("attempts").doc(id).update({ deadlineAt: Timestamp.fromMillis(Date.now() - 1000) });
    const result = await attempts.saveAnswer(db, STUDENT, id, q1, "b", 1);
    expect(result).toEqual({ saved: false, reason: "DEADLINE_PASSED" });
  });

  it("grades on submit with trusted keys, and a repeated submit changes nothing", async () => {
    const { examId, q1, q2 } = await publishedExam();
    const id = await attempts.startExam(db, STUDENT, examId);
    await attempts.saveAnswer(db, STUDENT, id, q1, "b", 1); // correct, 2 points
    await attempts.saveAnswer(db, STUDENT, id, q2, "c", 1); // wrong, 3 points

    await attempts.submitAttempt(db, STUDENT, id);
    await attempts.submitAttempt(db, STUDENT, id);

    const attempt = (await db.collection("attempts").doc(id).get()).data()!;
    expect(attempt).toMatchObject({ status: "GRADED", score: 2, maxScore: 5 });
    const results = await db.collection("results").where("attemptId", "==", id).get();
    expect(results.size).toBe(1);
    expect(results.docs[0].data()).toMatchObject({ score: 2, maxScore: 5, percentage: 40 });
  });

  it("refuses answers after submit", async () => {
    const { examId, q1 } = await publishedExam();
    const id = await attempts.startExam(db, STUDENT, examId);
    await attempts.submitAttempt(db, STUDENT, id);
    expect(await attempts.saveAnswer(db, STUDENT, id, q1, "b", 99)).toEqual({ saved: false, reason: "NOT_IN_PROGRESS" });
  });

  it("finalizes an expired attempt from saved answers only, on access", async () => {
    const { examId, q1, q2 } = await publishedExam();
    const id = await attempts.startExam(db, STUDENT, examId);
    await attempts.saveAnswer(db, STUDENT, id, q1, "b", 1);
    const deadline = Date.now() - 5000;
    await db.collection("attempts").doc(id).update({ deadlineAt: Timestamp.fromMillis(deadline) });

    const view = await attempts.getAttemptView(db, STUDENT, id);
    expect(view?.status).toBe("GRADED");
    expect(view?.result?.score).toBe(2);
    const submitted = (await db.collection("attempts").doc(id).get()).data()!.submittedAt.toMillis();
    expect(submitted).toBe(deadline);
    expect(view?.answers[q2]).toBeUndefined();
  });

  it("hides another student's attempt", async () => {
    const { examId } = await publishedExam();
    const id = await attempts.startExam(db, STUDENT, examId);
    expect(await attempts.getAttemptView(db, OTHER, id)).toBeNull();
  });

  it("shows correct answers and explanations only when the review policy allows", async () => {
    const hidden = await publishedExam({ showCorrect: false, showExplanations: false });
    const hid = await attempts.startExam(db, STUDENT, hidden.examId);
    await attempts.submitAttempt(db, STUDENT, hid);
    const hiddenView = await attempts.getAttemptView(db, STUDENT, hid);
    expect(hiddenView?.result?.correct).toBeNull();
    expect(hiddenView?.result?.explanations).toBeNull();

    const shown = await publishedExam({ showCorrect: true, showExplanations: true });
    const sid = await attempts.startExam(db, STUDENT, shown.examId);
    await attempts.submitAttempt(db, STUDENT, sid);
    const shownView = await attempts.getAttemptView(db, STUDENT, sid);
    expect(shownView?.result?.correct?.[shown.q1]).toBe("b");
    expect(Object.values(shownView?.result?.explanations ?? {})).toContain("لأن");
  });

  it("keeps option and question order stable per attempt, and every option present", async () => {
    const { examId } = await publishedExam({ shuffle: true });
    const id = await attempts.startExam(db, STUDENT, examId);
    const view = await attempts.getAttemptView(db, STUDENT, id);
    for (const q of view!.questions) expect(q.options.map((o) => o.id).sort()).toEqual(["a", "b", "c"]);
    const again = await attempts.getAttemptView(db, STUDENT, id);
    expect(again!.questions.map((q) => q.examQuestionId)).toEqual(view!.questions.map((q) => q.examQuestionId));
  });
});
