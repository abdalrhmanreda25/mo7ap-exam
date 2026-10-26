import { beforeAll, describe, expect, it } from "vitest";
import { startWithCode } from "./start-helper";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb, getAdminAuth } = await import("@/lib/firebase/admin-core");
const curriculum = await import("@/features/curriculum/service");
const questions = await import("@/features/questions/service");
const exams = await import("@/features/exams/service");
const attempts = await import("@/features/attempts/service");
const students = await import("@/features/students/service");
const media = await import("@/features/media/service");
const { provisionUser } = await import("@/lib/auth/provisioning");

const db = getAdminDb();
const ADMIN = "test-admin";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function setup() {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const subjectId = await curriculum.createSubject(db, ADMIN, {
    name: "S", nameAr: "س", slug: `x-${tag}`, description: "", academicYear: "2026", curriculum: "x", applicableTracks: [], order: 1, isActive: true,
  });
  const chapterId = await curriculum.createChapter(db, ADMIN, { subjectId, title: "c", titleAr: "ف", description: "", order: 1, isActive: true });
  const lessonId = await curriculum.createLesson(db, ADMIN, { subjectId, chapterId, title: "l", titleAr: "درس أ", order: 1, isActive: true });
  const base = {
    subjectId, chapterId, lessonId, type: "SINGLE_CHOICE" as const, statement: `q-${tag}`, statementAr: `q-${tag}`,
    mediaReferences: [] as string[], difficulty: "EASY" as const, explanation: "", explanationAr: "", status: "READY" as const,
    options: [{ id: "a", text: "A", textAr: "A", order: 1 }, { id: "b", text: "B", textAr: "B", order: 2 }], correctOptionId: "b",
  };
  const qid = await questions.createQuestion(db, ADMIN, base);
  const examId = await exams.createDraftExam(db, ADMIN, {
    title: "E", titleAr: `ام ${tag}`, description: "", subjectId, chapterIds: [], lessonIds: [], academicYear: "2026", durationSeconds: 600,
    shuffleQuestions: false, shuffleOptions: false, showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false,
  });
  await exams.addQuestionToExam(db, ADMIN, examId, qid, 2);
  await exams.publishExam(db, ADMIN, examId);
  return { qid, examId, base, tag };
}

describe("admin extras (emulator)", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
  });

  it("stores a question image and serves it back; rejects non-images and oversize", async () => {
    const url = await media.saveMedia(db, ADMIN, PNG);
    const id = url.split("/").pop()!;
    const back = await media.readMedia(db, id);
    expect(back?.mime).toBe("image/png");
    expect(() => media.parseDataUrl("data:text/html;base64,PGh0bWw+")).toThrow();
    const huge = "data:image/png;base64," + Buffer.alloc(600 * 1024).toString("base64");
    expect(() => media.parseDataUrl(huge)).toThrow("500");
  });

  it("adds images to a locked question, and a clone picks them up while the original snapshot stays", async () => {
    const { qid, examId, base } = await setup();
    await questions.updateQuestion(db, ADMIN, qid, { ...base, mediaReferences: ["/figures/x.png"] });
    const original = await db.collection("exams").doc(examId).collection("questions").doc(qid).get();
    expect(original.data()!.questionSnapshot.mediaReferences).toEqual([]);

    const { id: cloneId, skipped } = await exams.cloneExam(db, ADMIN, examId);
    expect(skipped).toBe(0);
    const clone = await exams.getExam(db, cloneId);
    expect(clone).toMatchObject({ status: "DRAFT", questionCount: 1, maxScore: 2 });
    const cloned = await db.collection("exams").doc(cloneId).collection("questions").doc(qid).get();
    expect(cloned.data()!.questionSnapshot.mediaReferences).toEqual(["/figures/x.png"]);
  });

  it("review policy can change on a published exam and is used when results are viewed", async () => {
    const { examId, qid } = await setup();
    const id = await startWithCode(db, "rp-student", examId);
    await attempts.saveAnswer(db, "rp-student", id, qid, "b", 1);
    await attempts.submitAttempt(db, "rp-student", id);
    expect((await attempts.getAttemptView(db, "rp-student", id))!.result!.correct).toBeNull();

    await exams.updateReviewPolicy(db, ADMIN, examId, { showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: true, showExplanationsAfterSubmit: false });
    expect((await attempts.getAttemptView(db, "rp-student", id))!.result!.correct?.[qid]).toBe("b");
  });

  it("student stats count correct, wrong, blank per exam and per lesson", async () => {
    const { examId, qid } = await setup();
    const email = `stats-${Date.now()}@example.test`;
    const { uid } = await provisionUser({ email, displayName: "إحصاء", role: "STUDENT", actorUid: ADMIN });
    const id = await startWithCode(db, uid, examId);
    await attempts.saveAnswer(db, uid, id, qid, "b", 1);
    await attempts.submitAttempt(db, uid, id);

    const stats = await students.getStudentStats(db, uid);
    expect(stats).toMatchObject({ completed: 1, averagePercentage: 100, totalCorrect: 1, totalWrong: 0, totalBlank: 0 });
    expect(stats.lessons[0]).toMatchObject({ titleAr: "درس أ", correct: 1, total: 1, percentage: 100 });
  });

  it("edits a student (name, email, password) and deletes only when no exam is in progress", async () => {
    const { examId } = await setup();
    const email = `edit-${Date.now()}@example.test`;
    const { uid } = await provisionUser({ email, displayName: "قديم", role: "STUDENT", actorUid: ADMIN });

    const newEmail = `new-${Date.now()}@example.test`;
    await students.updateStudent(db, ADMIN, uid, { displayName: "جديد", email: newEmail, password: "secret123" });
    const user = await getAdminAuth().getUser(uid);
    expect(user).toMatchObject({ displayName: "جديد", email: newEmail });
    expect((await db.collection("users").doc(uid).get()).data()).toMatchObject({ displayName: "جديد", email: newEmail });

    await startWithCode(db, uid, examId);
    await expect(students.deleteStudent(db, ADMIN, uid)).rejects.toThrow("امتحان الآن");

    const other = await provisionUser({ email: `del-${Date.now()}@example.test`, displayName: "حذف", role: "STUDENT", actorUid: ADMIN });
    await students.deleteStudent(db, ADMIN, other.uid);
    await expect(getAdminAuth().getUser(other.uid)).rejects.toThrow();
    expect((await db.collection("users").doc(other.uid).get()).exists).toBe(false);
  });

  it("admin edits while a student is mid-exam never lose the student's saved answers", async () => {
    const { examId, qid, base } = await setup();
    const student = "mid-exam-student";
    const id = await startWithCode(db, student, examId);
    await attempts.saveAnswer(db, student, id, qid, "b", 1);

    // Everything the admin can do to a published exam while it is being taken:
    await questions.updateQuestion(db, ADMIN, qid, { ...base, mediaReferences: ["/figures/y.png"], difficulty: "HARD" });
    await exams.updateReviewPolicy(db, ADMIN, examId, { showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: true, showExplanationsAfterSubmit: true });
    await exams.cloneExam(db, ADMIN, examId);
    await exams.closeExam(db, ADMIN, examId);
    const reopen = await students.reopenExamForAll(db, ADMIN, examId, "اختبار");
    expect(reopen.skipped).toBe(1); // the in-progress attempt is left alone
    await expect(exams.deleteExam(db, ADMIN, examId)).rejects.toThrow();

    // Reload: the saved answer is still there, and the student can keep answering and submit.
    const view = await attempts.getAttemptView(db, student, id);
    expect(view?.status).toBe("IN_PROGRESS");
    expect(view?.answers[qid]).toBe("b");
    expect((await attempts.saveAnswer(db, student, id, qid, "b", 2)).saved).toBe(true);
    await attempts.submitAttempt(db, student, id);
    expect((await db.collection("attempts").doc(id).get()).data()).toMatchObject({ status: "GRADED", score: 2 });
  });
});

