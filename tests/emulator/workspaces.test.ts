import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb } = await import("@/lib/firebase/admin-core");
const curriculum = await import("@/features/curriculum/service");
const questions = await import("@/features/questions/service");
const exams = await import("@/features/exams/service");
const attempts = await import("@/features/attempts/service");
const students = await import("@/features/students/service");
const media = await import("@/features/media/service");

const db = getAdminDb();
const tag = Date.now().toString(36);
const A = { uid: `teacher-a-${tag}`, workspaceId: `ws-a-${tag}` };
const B = { uid: `teacher-b-${tag}`, workspaceId: `ws-b-${tag}` };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Teacher A's world: a published exam with a code and one student who has started it. */
async function teacherAWorld() {
  const subjectId = await curriculum.createSubject(db, A, {
    name: "S", nameAr: "مادة", slug: `ws-${tag}`, description: "", academicYear: "2026", curriculum: "x",
    applicableTracks: [], order: 1, isActive: true,
  });
  const chapterId = await curriculum.createChapter(db, A, { subjectId, title: "c", titleAr: "ف", description: "", order: 1, isActive: true });
  const lessonId = await curriculum.createLesson(db, A, { subjectId, chapterId, title: "l", titleAr: "د", order: 1, isActive: true });
  const mediaId = await media.saveMedia(db, A, PNG);
  const questionId = await questions.createQuestion(db, A, {
    subjectId, chapterId, lessonId, type: "SINGLE_CHOICE", statement: `q-${tag}`, statementAr: `q-${tag}`,
    mediaReferences: [`/api/media/${mediaId}`], difficulty: "EASY", explanation: "", explanationAr: "", status: "READY",
    options: [{ id: "a", text: "A", textAr: "أ", order: 1 }, { id: "b", text: "B", textAr: "ب", order: 2 }],
    correctOptionId: "a",
  });
  const examId = await exams.createDraftExam(db, A, {
    title: "E", titleAr: `ام ${tag}`, description: "", subjectId, chapterIds: [], lessonIds: [], academicYear: "2026",
    durationSeconds: 600, shuffleQuestions: false, shuffleOptions: false,
    showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false,
  });
  await exams.addQuestionToExam(db, A, examId, questionId, 1);
  await exams.publishExam(db, A, examId);
  const code = await exams.generateAccessCode(db, A, examId);
  const studentUid = await students.createStudent(db, A, { displayName: "طالب أ", email: `a-${tag}@example.test`, password: "secret123", grade: "sec3" });
  const attemptId = await attempts.startExam(db, studentUid, examId, code);
  return { subjectId, chapterId, lessonId, questionId, examId, code, studentUid, attemptId, mediaId };
}

describe("teacher spaces are isolated (Firestore emulator)", () => {
  let a: Awaited<ReturnType<typeof teacherAWorld>>;

  beforeAll(async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
    a = await teacherAWorld();
  });

  it("teacher A sees their own data", async () => {
    expect((await curriculum.listSubjects(db, A.workspaceId)).map((s) => s.id)).toContain(a.subjectId);
    expect((await questions.listQuestions(db, A.workspaceId)).map((q) => q.id)).toContain(a.questionId);
    expect((await exams.listExams(db, A.workspaceId)).map((e) => e.id)).toContain(a.examId);
    expect((await students.listStudents(db, A.workspaceId)).map((s) => s.uid)).toContain(a.studentUid);
    expect(await media.readMedia(db, A.workspaceId, a.mediaId)).not.toBeNull();
  });

  it("teacher B lists nothing of teacher A", async () => {
    expect((await curriculum.listSubjects(db, B.workspaceId)).map((s) => s.id)).not.toContain(a.subjectId);
    expect((await curriculum.listChapters(db, B.workspaceId)).map((c) => c.id)).not.toContain(a.chapterId);
    expect((await curriculum.listLessons(db, B.workspaceId)).map((l) => l.id)).not.toContain(a.lessonId);
    expect((await questions.listQuestions(db, B.workspaceId)).map((q) => q.id)).not.toContain(a.questionId);
    expect((await exams.listExams(db, B.workspaceId)).map((e) => e.id)).not.toContain(a.examId);
    expect((await students.listStudents(db, B.workspaceId)).map((s) => s.uid)).not.toContain(a.studentUid);
  });

  it("teacher B cannot open teacher A's documents by ID", async () => {
    expect(await curriculum.getSubject(db, B.workspaceId, a.subjectId)).toBeNull();
    expect(await questions.getQuestionDetail(db, B.workspaceId, a.questionId)).toBeNull();
    expect(await exams.getExam(db, B.workspaceId, a.examId)).toBeNull();
    expect(await exams.getAccessCode(db, B.workspaceId, a.examId)).toBeNull();
    expect(await students.getStudent(db, B.workspaceId, a.studentUid)).toBeNull();
    expect(await students.listStudentAttempts(db, B.workspaceId, a.studentUid)).toEqual([]);
    expect(await media.readMedia(db, B.workspaceId, a.mediaId)).toBeNull();
  });

  it("teacher B cannot change teacher A's data", async () => {
    const notFound = /غير موجود/;
    await expect(curriculum.updateSubject(db, B, a.subjectId, {
      name: "x", nameAr: "اختراق", slug: `hack-${tag}`, description: "", academicYear: "2026", curriculum: "x",
      applicableTracks: [], order: 1, isActive: true,
    })).rejects.toThrow(notFound);
    await expect(exams.generateAccessCode(db, B, a.examId)).rejects.toThrow(notFound);
    await expect(exams.closeExam(db, B, a.examId)).rejects.toThrow(notFound);
    await expect(exams.deleteExam(db, B, a.examId)).rejects.toThrow(notFound);
    await expect(students.updateStudent(db, B, a.studentUid, { displayName: "x", email: `x-${tag}@example.test` })).rejects.toThrow(notFound);
    await expect(students.deleteStudent(db, B, a.studentUid)).rejects.toThrow(notFound);
    await expect(students.reopenAttempt(db, B, a.attemptId, "سبب كافٍ")).rejects.toThrow(notFound);
    await expect(exams.createDraftExam(db, B, {
      title: "E", titleAr: "ام", description: "", subjectId: a.subjectId, chapterIds: [], lessonIds: [], academicYear: "2026",
      durationSeconds: 600, shuffleQuestions: false, shuffleOptions: false,
      showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false,
    })).rejects.toThrow(notFound);
    // Unchanged after every refused attempt.
    expect((await curriculum.getSubject(db, A.workspaceId, a.subjectId))?.nameAr).toBe("مادة");
    expect(await exams.getAccessCode(db, A.workspaceId, a.examId)).toBe(a.code);
  });

  it("a student of teacher B neither sees nor starts teacher A's exam", async () => {
    const bStudent = await students.createStudent(db, B, { displayName: "طالب ب", email: `b-${tag}@example.test`, password: "secret123", grade: "sec3" });
    expect((await attempts.listPublishedExams(db, B.workspaceId, "sec3")).map((e) => e.id)).not.toContain(a.examId);
    expect(await attempts.getExamForStudent(db, B.workspaceId, a.examId, "sec3")).toBeNull();
    await expect(attempts.startExam(db, bStudent, a.examId, a.code)).rejects.toThrow(/غير موجود/);
  });

  it("the same subject code can exist once in each space", async () => {
    await expect(curriculum.createSubject(db, B, {
      name: "S", nameAr: "مادة ب", slug: `ws-${tag}`, description: "", academicYear: "2026", curriculum: "x",
      applicableTracks: [], order: 1, isActive: true,
    })).resolves.toBeTypeOf("string");
  });
});
