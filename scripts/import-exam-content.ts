/**
 * Loads an exam content file (content/*.json) into its subject (subjectSlug, default "chemistry"):
 * chapter, lessons, questions (READY, difficulty from exam.difficulty), and a published exam.
 * Idempotent: reuses chapter, lessons, and questions with the same text; skips the exam if the title exists.
 * Existing questions get their lesson and images synced; neither is locked content.
 *
 *   npx tsx --conditions=react-server scripts/import-exam-content.ts [content/chemistry-ch1-medium.json]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getAdminDb } from "../src/lib/firebase/admin-core";
import * as curriculum from "../src/features/curriculum/service";
import * as questions from "../src/features/questions/service";
import * as exams from "../src/features/exams/service";
import { COLLECTIONS } from "../src/types/firestore";

const ACTOR = "content-import";
const contentFile = process.argv[2] ?? "content/chemistry-ch1-medium.json";
const data = JSON.parse(readFileSync(path.resolve(contentFile), "utf8"));
const difficulty: "EASY" | "MEDIUM" | "HARD" = data.exam.difficulty ?? "MEDIUM";
const LETTERS = ["o1", "o2", "o3", "o4", "o5", "o6"];

async function main() {
  const db = getAdminDb();
  const slug: string = data.subjectSlug ?? "chemistry";
  const subjectSnap = await db.collection(COLLECTIONS.subjects).where("slug", "==", slug).limit(1).get();
  if (subjectSnap.empty) throw new Error(`Subject '${slug}' not found. Run scripts/seed-subjects.ts first.`);
  const subjectId = subjectSnap.docs[0].id;

  // Chapter
  let chapterId = (await curriculum.listChapters(db, subjectId)).find((c) => c.titleAr === data.chapter.titleAr)?.id;
  if (!chapterId) {
    chapterId = await curriculum.createChapter(db, ACTOR, {
      subjectId, title: data.chapter.title, titleAr: data.chapter.titleAr, description: "", order: data.chapter.order, isActive: true,
    });
    console.log("chapter created", chapterId);
  } else console.log("chapter exists", chapterId);

  // Lessons
  const lessonIdByKey = new Map<string, string>();
  const existingLessons = await curriculum.listLessons(db, chapterId);
  for (const lesson of data.lessons) {
    let id = existingLessons.find((l) => l.titleAr === lesson.titleAr)?.id;
    if (!id) {
      id = await curriculum.createLesson(db, ACTOR, {
        subjectId, chapterId, title: lesson.title, titleAr: lesson.titleAr, order: lesson.order, isActive: true,
      });
      console.log("lesson created", lesson.titleAr);
    }
    lessonIdByKey.set(lesson.key, id);
  }

  // Questions
  const questionIds: string[] = [];
  const bank = await questions.listQuestions(db, { subjectId });
  for (const q of data.questions) {
    const existing = bank.find((b) => b.statementAr === q.q && b.chapterId === chapterId);
    if (existing) {
      // Images and lesson are not locked content, so they can change even after the question is used in a published exam.
      const wanted: string[] = q.media ?? [];
      const wantedLesson = lessonIdByKey.get(q.lesson)!;
      const detail = await questions.getQuestionDetail(db, existing.id);
      const mediaChanged = detail && wanted.length > 0 && JSON.stringify(detail.mediaReferences) !== JSON.stringify(wanted);
      if (detail && (mediaChanged || detail.lessonId !== wantedLesson)) {
        await questions.updateQuestion(db, ACTOR, existing.id, {
          subjectId: detail.subjectId,
          chapterId: detail.chapterId,
          lessonId: wantedLesson,
          type: detail.type,
          statement: detail.statement,
          statementAr: detail.statementAr,
          mediaReferences: mediaChanged ? wanted : detail.mediaReferences,
          difficulty: detail.difficulty,
          explanation: detail.explanation,
          explanationAr: detail.explanationAr,
          status: detail.status,
          options: detail.options,
          correctOptionId: detail.correctOptionId,
        });
        console.log("question updated", existing.id);
      }
      questionIds.push(existing.id);
      continue;
    }
    const options = q.options.map((text: string, i: number) => ({ id: LETTERS[i], text, textAr: text, order: i + 1 }));
    const id = await questions.createQuestion(db, ACTOR, {
      subjectId,
      chapterId,
      lessonId: lessonIdByKey.get(q.lesson)!,
      type: "SINGLE_CHOICE",
      statement: q.q,
      statementAr: q.q,
      mediaReferences: q.media ?? [],
      difficulty,
      explanation: "",
      explanationAr: "",
      status: "READY",
      options,
      correctOptionId: LETTERS[q.correct - 1],
    });
    questionIds.push(id);
  }
  console.log("questions ready:", questionIds.length);

  // Exam
  // Replace an older version of this exam (different question count) only if no student has started it.
  const existingExam = await db.collection(COLLECTIONS.exams).where("titleAr", "==", data.exam.titleAr).limit(1).get();
  if (!existingExam.empty) {
    const oldId = existingExam.docs[0].id;
    if (existingExam.docs[0].data().questionCount === questionIds.length) {
      console.log("exam exists", oldId, existingExam.docs[0].data().status);
      return;
    }
    await exams.deleteExam(db, ACTOR, oldId);
    console.log("deleted older version", oldId);
  }
  const examId = await exams.createDraftExam(db, ACTOR, {
    title: data.exam.title,
    titleAr: data.exam.titleAr,
    description: data.exam.descriptionAr ?? "امتحان متوسط المستوى على الباب الأول فقط.",
    subjectId,
    chapterIds: [chapterId],
    lessonIds: [],
    academicYear: "الثانوية العامة",
    durationSeconds: data.exam.durationMinutes * 60,
    shuffleQuestions: true,
    shuffleOptions: true,
    showScoreAfterSubmit: true,
    showCorrectAnswersAfterSubmit: false,
    showExplanationsAfterSubmit: false,
  });
  for (const qid of questionIds) await exams.addQuestionToExam(db, ACTOR, examId, qid, data.exam.pointsPerQuestion);
  await exams.publishExam(db, ACTOR, examId);
  const exam = await exams.getExam(db, examId);
  console.log("exam published", examId, exam?.status, "questions", exam?.questionCount, "maxScore", exam?.maxScore);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
