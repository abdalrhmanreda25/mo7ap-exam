import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb } = await import("@/lib/firebase/admin-core");
const curriculum = await import("@/features/curriculum/service");
const questions = await import("@/features/questions/service");
const exams = await import("@/features/exams/service");
const attempts = await import("@/features/attempts/service");
const students = await import("@/features/students/service");

const db = getAdminDb();
const ADMIN = { uid: "test-admin", workspaceId: "main" };
const WS = ADMIN.workspaceId;

async function publishedExam(grade: "prep1" | "sec3" | undefined) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const subjectId = await curriculum.createSubject(db, ADMIN, {
    name: "G", nameAr: "ص", slug: `grade-${tag}`, description: "", academicYear: "2026", curriculum: "x",
    grade, applicableTracks: [], order: 1, isActive: true,
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
    title: "E", titleAr: `ام ${tag}`, description: "", subjectId, chapterIds: [], lessonIds: [], academicYear: "2026", grade,
    durationSeconds: 600, shuffleQuestions: false, shuffleOptions: false,
    showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false,
  });
  await exams.addQuestionToExam(db, ADMIN, examId, q, 1);
  await exams.publishExam(db, ADMIN, examId);
  return { examId, subjectId, code: await exams.generateAccessCode(db, ADMIN, examId) };
}

describe("school years (Firestore emulator)", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
  });

  it("admin adds a student with a year and can change it", async () => {
    const email = `brother-${Date.now()}@example.test`;
    const uid = await students.createStudent(db, ADMIN, { displayName: "أخ", email, password: "secret123", grade: "prep1" });
    expect(await students.getStudent(db, WS, uid)).toMatchObject({ displayName: "أخ", email, grade: "prep1", isActive: true });
    expect((await students.listStudents(db, WS)).find((s) => s.uid === uid)?.grade).toBe("prep1");

    await expect(students.createStudent(db, ADMIN, { displayName: "مكرر", email, password: "secret123", grade: "sec1" })).rejects.toThrow("مستخدم");

    await students.updateStudent(db, ADMIN, uid, { displayName: "أخ", email, grade: "sec1" });
    expect((await students.getStudent(db, WS, uid))?.grade).toBe("sec1");
  });

  it("a student sees and starts only exams of their own year", async () => {
    const prep = await publishedExam("prep1");
    const sec = await publishedExam("sec3");
    const uid = await students.createStudent(db, ADMIN, { displayName: "صغير", email: `small-${Date.now()}@example.test`, password: "secret123", grade: "prep1" });

    const visible = (await attempts.listPublishedExams(db, WS, "prep1")).map((e) => e.id);
    expect(visible).toContain(prep.examId);
    expect(visible).not.toContain(sec.examId);
    expect(await attempts.getExamForStudent(db, WS, sec.examId, "prep1")).toBeNull();
    expect(await attempts.getExamForStudent(db, WS, prep.examId, "prep1")).not.toBeNull();

    // Even with the right code, the server refuses another year's exam.
    await expect(attempts.startExam(db, uid, sec.examId, sec.code)).rejects.toThrow("ليس لصفك");
    expect(await attempts.startExam(db, uid, prep.examId, prep.code)).toBe(`${prep.examId}__${uid}`);
  });

  it("exams, subjects, and students saved before years existed count as third secondary", async () => {
    const legacy = await publishedExam(undefined);
    expect((await exams.getExam(db, WS, legacy.examId))?.grade).toBe("sec3");
    expect((await curriculum.getSubject(db, WS, legacy.subjectId))?.grade).toBe("sec3");
    // A student with no profile year (the existing brother) still starts a third secondary exam.
    expect(await attempts.startExam(db, `legacy-${Date.now()}`, legacy.examId, legacy.code)).toContain(legacy.examId);
  });
});
