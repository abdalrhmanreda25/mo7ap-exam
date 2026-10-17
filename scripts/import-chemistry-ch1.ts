/**
 * Loads content/chemistry-ch1-medium.json into the subject "chemistry":
 * chapter, lessons, questions (READY, MEDIUM), and a published exam.
 * Idempotent: reuses chapter, lessons, and questions with the same text; skips the exam if the title exists.
 *
 *   npx tsx --conditions=react-server scripts/import-chemistry-ch1.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getAdminDb } from "../src/lib/firebase/admin-core";
import * as curriculum from "../src/features/curriculum/service";
import * as questions from "../src/features/questions/service";
import * as exams from "../src/features/exams/service";
import { COLLECTIONS } from "../src/types/firestore";

const ACTOR = "content-import-chemistry-ch1";
const data = JSON.parse(readFileSync(path.resolve("content/chemistry-ch1-medium.json"), "utf8"));
const LETTERS = ["o1", "o2", "o3", "o4", "o5", "o6"];

async function main() {
  const db = getAdminDb();
  const subjectSnap = await db.collection(COLLECTIONS.subjects).where("slug", "==", "chemistry").limit(1).get();
  if (subjectSnap.empty) throw new Error("Subject 'chemistry' not found. Run scripts/seed-subjects.ts first.");
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
      mediaReferences: [],
      difficulty: "MEDIUM",
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
  const existingExam = await db.collection(COLLECTIONS.exams).where("titleAr", "==", data.exam.titleAr).limit(1).get();
  if (!existingExam.empty) {
    console.log("exam exists", existingExam.docs[0].id, existingExam.docs[0].data().status);
    return;
  }
  const examId = await exams.createDraftExam(db, ACTOR, {
    title: data.exam.title,
    titleAr: data.exam.titleAr,
    description: "امتحان متوسط المستوى على الباب الأول فقط.",
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
