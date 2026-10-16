import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb } = await import("@/lib/firebase/admin-core");
const curriculum = await import("@/features/curriculum/service");
const questions = await import("@/features/questions/service");
const exams = await import("@/features/exams/service");
const { DomainError } = await import("@/lib/server/errors");

const ACTOR = "test-admin";
const db = getAdminDb();

const questionInput = (subjectId: string, chapterId: string, lessonId: string, correct = "b") => ({
  subjectId,
  chapterId,
  lessonId,
  type: "SINGLE_CHOICE" as const,
  statement: "What is 2+2?",
  statementAr: "كم يساوي 2+2؟",
  mediaReferences: [],
  difficulty: "EASY" as const,
  explanation: "Basic arithmetic.",
  explanationAr: "حساب أساسي.",
  status: "READY" as const,
  options: [
    { id: "a", text: "3", textAr: "3", order: 1 },
    { id: "b", text: "4", textAr: "4", order: 2 },
    { id: "c", text: "5", textAr: "5", order: 3 },
  ],
  correctOptionId: correct,
});

const examConfig = (subjectId: string) => ({
  title: "Math quiz",
  titleAr: "اختبار الرياضيات",
  description: "",
  subjectId,
  chapterIds: [],
  lessonIds: [],
  academicYear: "2026",
  durationSeconds: 1800,
  shuffleQuestions: true,
  shuffleOptions: false,
  showScoreAfterSubmit: true,
  showCorrectAnswersAfterSubmit: false,
  showExplanationsAfterSubmit: false,
});

async function curriculumFixture() {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const subjectId = await curriculum.createSubject(db, ACTOR, {
    name: "Math",
    nameAr: "الرياضيات",
    slug: `math-${tag}`,
    description: "",
    academicYear: "2026",
    curriculum: "thanaweya",
    applicableTracks: ["science"],
    order: 1,
    isActive: true,
  });
  const chapterId = await curriculum.createChapter(db, ACTOR, {
    subjectId,
    title: "Algebra",
    titleAr: "الجبر",
    description: "",
    order: 1,
    isActive: true,
  });
  const lessonId = await curriculum.createLesson(db, ACTOR, {
    subjectId,
    chapterId,
    title: "Addition",
    titleAr: "الجمع",
    order: 1,
    isActive: true,
  });
  return { subjectId, chapterId, lessonId };
}

async function newQuestion(fx: { subjectId: string; chapterId: string; lessonId: string }, correct = "b") {
  return questions.createQuestion(db, ACTOR, questionInput(fx.subjectId, fx.chapterId, fx.lessonId, correct));
}

describe("exam composition and publish (Firestore emulator)", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
  });

  it("composes, publishes, and freezes snapshots and keys away from clients", async () => {
    const fx = await curriculumFixture();
    const qid = await newQuestion(fx);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));
    await exams.addQuestionToExam(db, ACTOR, examId, qid, 2);

    const draft = await exams.getExam(db, examId);
    expect(draft).toMatchObject({ status: "DRAFT", questionCount: 1, maxScore: 2 });

    await exams.publishExam(db, ACTOR, examId);

    const published = await exams.getExam(db, examId);
    expect(published?.status).toBe("PUBLISHED");

    const key = await db.collection("examAnswerKeys").doc(examId).collection("items").doc(qid).get();
    // Keys use the same option IDs as optionsSnapshot, which is what students submit.
    expect(key.data()).toMatchObject({ correctOptionId: "b", points: 2, gradingVersion: 1 });

    const snapshot = await db.collection("exams").doc(examId).collection("questions").doc(qid).get();
    const snapshotData = snapshot.data()!;
    expect(JSON.stringify(snapshotData)).not.toMatch(/correct/i);
    expect(snapshotData.optionsSnapshot.map((o: { optionId: string }) => o.optionId)).toEqual(["a", "b", "c"]);
  });

  it("refuses to publish a draft whose stored maximum score is stale", async () => {
    const fx = await curriculumFixture();
    const qid = await newQuestion(fx);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));
    await exams.addQuestionToExam(db, ACTOR, examId, qid, 2);
    await db.collection("exams").doc(examId).update({ maxScore: 50 });

    await expect(exams.publishExam(db, ACTOR, examId)).rejects.toBeInstanceOf(DomainError);
    expect((await exams.getExam(db, examId))?.status).toBe("DRAFT");
    const keys = await db.collection("examAnswerKeys").doc(examId).collection("items").get();
    expect(keys.empty).toBe(true);
  });

  it("refuses to add a question with no correct answer, and refuses an empty publish", async () => {
    const fx = await curriculumFixture();
    const qid = await newQuestion(fx);
    await db.collection("questionAnswerKeys").doc(qid).delete();
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));

    await expect(exams.addQuestionToExam(db, ACTOR, examId, qid, 1)).rejects.toThrow("إجابة صحيحة");
    await expect(exams.publishExam(db, ACTOR, examId)).rejects.toBeInstanceOf(DomainError);
  });

  it("allows only one winner when two publish requests race", async () => {
    const fx = await curriculumFixture();
    const qid = await newQuestion(fx);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));
    await exams.addQuestionToExam(db, ACTOR, examId, qid, 2);

    const results = await Promise.allSettled([
      exams.publishExam(db, ACTOR, examId),
      exams.publishExam(db, ACTOR, examId),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const keys = await db.collection("examAnswerKeys").doc(examId).collection("items").get();
    expect(keys.size).toBe(1);
  });

  it("locks content of a bank question once a published exam uses it, but allows metadata edits", async () => {
    const fx = await curriculumFixture();
    const qid = await newQuestion(fx);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));
    await exams.addQuestionToExam(db, ACTOR, examId, qid, 2);
    await exams.publishExam(db, ACTOR, examId);

    const before = await db.collection("exams").doc(examId).collection("questions").doc(qid).get();

    const current = (await questions.getQuestionDetail(db, qid))!;
    const base = { ...questionInput(fx.subjectId, fx.chapterId, fx.lessonId), options: current.options, correctOptionId: current.correctOptionId };

    await expect(
      questions.updateQuestion(db, ACTOR, qid, { ...base, statement: "Changed statement" }),
    ).rejects.toThrow("لا يمكن تغيير");
    await expect(questions.updateQuestion(db, ACTOR, qid, { ...base, correctOptionId: "c" })).rejects.toThrow("الإجابة الصحيحة");

    await questions.updateQuestion(db, ACTOR, qid, { ...base, difficulty: "HARD" });

    const after = await db.collection("exams").doc(examId).collection("questions").doc(qid).get();
    expect(after.data()).toEqual(before.data());
    const key = await db.collection("examAnswerKeys").doc(examId).collection("items").doc(qid).get();
    expect(key.data()?.correctOptionId).toBe("b");
  });

  it("a bank question used only by drafts stays editable", async () => {
    const fx = await curriculumFixture();
    const qid = await newQuestion(fx);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));
    await exams.addQuestionToExam(db, ACTOR, examId, qid, 1);

    const current = (await questions.getQuestionDetail(db, qid))!;
    await questions.updateQuestion(db, ACTOR, qid, {
      ...questionInput(fx.subjectId, fx.chapterId, fx.lessonId),
      statement: "Edited while draft",
      options: current.options,
      correctOptionId: current.correctOptionId,
    });
    expect((await questions.getQuestionDetail(db, qid))?.statement).toBe("Edited while draft");
  });

  it("a published exam cannot be composed, published again, or archived before close", async () => {
    const fx = await curriculumFixture();
    const qid = await newQuestion(fx);
    const other = await newQuestion(fx);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));
    await exams.addQuestionToExam(db, ACTOR, examId, qid, 2);
    await exams.publishExam(db, ACTOR, examId);

    await expect(exams.addQuestionToExam(db, ACTOR, examId, other, 1)).rejects.toThrow("للمسودات");
    await expect(exams.publishExam(db, ACTOR, examId)).rejects.toThrow("للمسودات");
    await expect(exams.archiveExam(db, ACTOR, examId)).rejects.toThrow("المغلقة");
  });

  it("closes without erasing the exam or its keys, then archives", async () => {
    const fx = await curriculumFixture();
    const qid = await newQuestion(fx);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));
    await exams.addQuestionToExam(db, ACTOR, examId, qid, 2);
    await exams.publishExam(db, ACTOR, examId);

    await exams.closeExam(db, ACTOR, examId);
    await exams.archiveExam(db, ACTOR, examId);

    const exam = await exams.getExam(db, examId);
    expect(exam).toMatchObject({ status: "CLOSED", archived: true });
    const key = await db.collection("examAnswerKeys").doc(examId).collection("items").doc(qid).get();
    expect(key.exists).toBe(true);
  });

  it("keeps order contiguous after removal and swaps on move", async () => {
    const fx = await curriculumFixture();
    const q1 = await newQuestion(fx);
    const q2 = await newQuestion(fx);
    const q3 = await newQuestion(fx);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fx.subjectId));
    for (const q of [q1, q2, q3]) await exams.addQuestionToExam(db, ACTOR, examId, q, 1);

    await exams.moveQuestionInExam(db, examId, q3, "up");
    const idsAfterMove = (await exams.getExamComposition(db, examId)).map((i) => i.questionId);
    expect(idsAfterMove).toEqual([q1, q3, q2]);

    await exams.removeQuestionFromExam(db, ACTOR, examId, q1);
    const ordersAfterRemove = (await exams.getExamComposition(db, examId)).map((i) => i.order);
    expect(ordersAfterRemove).toEqual([1, 2]);
    expect((await exams.getExam(db, examId))?.questionCount).toBe(2);
  });

  it("rejects adding a question from another subject", async () => {
    const fxA = await curriculumFixture();
    const fxB = await curriculumFixture();
    const qid = await newQuestion(fxB);
    const examId = await exams.createDraftExam(db, ACTOR, examConfig(fxA.subjectId));
    await expect(exams.addQuestionToExam(db, ACTOR, examId, qid, 1)).rejects.toThrow("لا ينتمي");
  });

  it("refuses lesson placement that does not match the chapter and subject", async () => {
    const fx = await curriculumFixture();
    const other = await curriculumFixture();
    await expect(
      questions.createQuestion(db, ACTOR, questionInput(fx.subjectId, other.chapterId, other.lessonId)),
    ).rejects.toThrow("لا ينتمي");
  });
});
