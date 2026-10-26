import type { Firestore } from "firebase-admin/firestore";
import * as curriculum from "@/features/curriculum/service";
import * as questions from "@/features/questions/service";
import * as exams from "@/features/exams/service";
import { COLLECTIONS } from "@/types/firestore";

/** Shape of content/*.json: one chapter, its lessons, and a ready exam of single-choice questions. */
export interface ContentPack {
  subjectSlug?: string;
  chapter: { titleAr: string; title: string; order: number };
  lessons: { key: string; titleAr: string; title: string; order: number }[];
  exam: {
    titleAr: string;
    title: string;
    descriptionAr?: string;
    difficulty?: "EASY" | "MEDIUM" | "HARD";
    durationMinutes: number;
    pointsPerQuestion: number;
  };
  questions: { lesson: string; q: string; options: string[]; correct: number; media?: string[] }[];
}

export type PackImportResult =
  | { status: "published"; examId: string; questionCount: number; accessCode: string }
  | { status: "exists"; examId: string };

const OPTION_IDS = ["o1", "o2", "o3", "o4", "o5", "o6"];

/**
 * Loads a content pack into its subject: chapter, lessons, questions (READY), and a published exam
 * with an access code. Idempotent: reuses chapter, lessons, and questions with the same text, and
 * leaves an existing exam with the same title alone. Existing questions get their lesson and images
 * synced; neither is locked content.
 */
export async function importContentPack(
  db: Firestore,
  actor: string,
  pack: ContentPack,
  log: (message: string) => void = () => {},
): Promise<PackImportResult> {
  const slug = pack.subjectSlug ?? "chemistry";
  const difficulty = pack.exam.difficulty ?? "MEDIUM";
  const subjectSnap = await db.collection(COLLECTIONS.subjects).where("slug", "==", slug).limit(1).get();
  if (subjectSnap.empty) throw new Error(`المادة "${slug}" غير موجودة.`);
  const subjectId = subjectSnap.docs[0].id;

  let chapterId = (await curriculum.listChapters(db, subjectId)).find((c) => c.titleAr === pack.chapter.titleAr)?.id;
  if (!chapterId) {
    chapterId = await curriculum.createChapter(db, actor, {
      subjectId, title: pack.chapter.title, titleAr: pack.chapter.titleAr, description: "", order: pack.chapter.order, isActive: true,
    });
    log(`chapter created ${chapterId}`);
  }

  const lessonIdByKey = new Map<string, string>();
  const existingLessons = await curriculum.listLessons(db, chapterId);
  for (const lesson of pack.lessons) {
    let id = existingLessons.find((l) => l.titleAr === lesson.titleAr)?.id;
    if (!id) {
      id = await curriculum.createLesson(db, actor, {
        subjectId, chapterId, title: lesson.title, titleAr: lesson.titleAr, order: lesson.order, isActive: true,
      });
      log(`lesson created ${lesson.titleAr}`);
    }
    lessonIdByKey.set(lesson.key, id);
  }

  const questionIds: string[] = [];
  const bank = await questions.listQuestions(db, { subjectId });
  for (const q of pack.questions) {
    const lessonId = lessonIdByKey.get(q.lesson);
    if (!lessonId) throw new Error(`Unknown lesson key "${q.lesson}".`);
    const existing = bank.find((b) => b.statementAr === q.q && b.chapterId === chapterId);
    if (existing) {
      const wanted = q.media ?? [];
      const detail = await questions.getQuestionDetail(db, existing.id);
      const mediaChanged = Boolean(detail) && wanted.length > 0 && JSON.stringify(detail!.mediaReferences) !== JSON.stringify(wanted);
      if (detail && (mediaChanged || detail.lessonId !== lessonId)) {
        await questions.updateQuestion(db, actor, existing.id, {
          subjectId: detail.subjectId,
          chapterId: detail.chapterId,
          lessonId,
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
        log(`question updated ${existing.id}`);
      }
      questionIds.push(existing.id);
      continue;
    }
    questionIds.push(
      await questions.createQuestion(db, actor, {
        subjectId,
        chapterId,
        lessonId,
        type: "SINGLE_CHOICE",
        statement: q.q,
        statementAr: q.q,
        mediaReferences: q.media ?? [],
        difficulty,
        explanation: "",
        explanationAr: "",
        status: "READY",
        options: q.options.map((text, i) => ({ id: OPTION_IDS[i], text, textAr: text, order: i + 1 })),
        correctOptionId: OPTION_IDS[q.correct - 1],
      }),
    );
  }
  log(`questions ready: ${questionIds.length}`);

  // Replace an older version of this exam (different question count) only if no student has started it.
  const existingExam = await db.collection(COLLECTIONS.exams).where("titleAr", "==", pack.exam.titleAr).limit(1).get();
  if (!existingExam.empty) {
    const old = existingExam.docs[0];
    if (old.data().questionCount === questionIds.length) return { status: "exists", examId: old.id };
    await exams.deleteExam(db, actor, old.id);
    log(`deleted older version ${old.id}`);
  }

  const examId = await exams.createDraftExam(db, actor, {
    title: pack.exam.title,
    titleAr: pack.exam.titleAr,
    description: pack.exam.descriptionAr ?? "",
    subjectId,
    chapterIds: [chapterId],
    lessonIds: [],
    academicYear: "الثانوية العامة",
    durationSeconds: pack.exam.durationMinutes * 60,
    shuffleQuestions: true,
    shuffleOptions: true,
    showScoreAfterSubmit: true,
    showCorrectAnswersAfterSubmit: false,
    showExplanationsAfterSubmit: false,
  });
  for (const id of questionIds) await exams.addQuestionToExam(db, actor, examId, id, pack.exam.pointsPerQuestion);
  await exams.publishExam(db, actor, examId);
  const accessCode = await exams.generateAccessCode(db, actor, examId);
  log(`exam published ${examId} questions ${questionIds.length} code ${accessCode}`);
  return { status: "published", examId, questionCount: questionIds.length, accessCode };
}
