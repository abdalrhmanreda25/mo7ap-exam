import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { auditLogWrite } from "@/lib/audit/log";
import { DomainError } from "@/lib/server/errors";
import type { QuestionInput } from "@/lib/validation/questions";
import { COLLECTIONS, type QuestionDifficulty, type QuestionStatus, type QuestionType } from "@/types/firestore";
import { changedContentFields, CONTENT_FIELD_LABELS, isContentLocked, type QuestionContent } from "./content-lock";

export interface QuestionListItem {
  id: string;
  subjectId: string;
  chapterId: string;
  lessonId: string;
  type: QuestionType;
  statement: string;
  statementAr: string;
  difficulty: QuestionDifficulty;
  status: QuestionStatus;
  usedInExams: number;
}

export interface QuestionDetail extends QuestionInput {
  id: string;
  locked: boolean;
  lockedBy: { examId: string; examStatus: string }[];
}

/** Firestore option IDs must be unique across the collection, so they are scoped by question. */
export function optionDocId(questionId: string, clientOptionId: string): string {
  return `${questionId}__${clientOptionId}`;
}

type ExamUsage = { examId: string; examStatus: string };

/**
 * Statuses of every exam that holds this question. Drives content locking.
 * An exam question's doc ID is the bank question ID, so this reads one doc per exam
 * instead of a collection-group query, which needs a dedicated index in production.
 */
export async function questionExamUsage(db: Firestore, questionId: string): Promise<ExamUsage[]> {
  const exams = await db.collection(COLLECTIONS.exams).get();
  if (exams.empty) return [];
  const held = await db.getAll(...exams.docs.map((exam) => exam.ref.collection(COLLECTIONS.examQuestions).doc(questionId)));
  return exams.docs
    .filter((_, index) => held[index].exists)
    .map((exam) => ({ examId: exam.id, examStatus: String(exam.data().status ?? "UNKNOWN") }));
}

/** Exam usage for every question at once: one read of each exam's question list. */
export async function examUsageByQuestion(db: Firestore): Promise<Map<string, ExamUsage[]>> {
  const exams = await db.collection(COLLECTIONS.exams).get();
  const lists = await Promise.all(exams.docs.map((exam) => exam.ref.collection(COLLECTIONS.examQuestions).select().get()));
  const usage = new Map<string, ExamUsage[]>();
  exams.docs.forEach((exam, index) => {
    for (const item of lists[index].docs) {
      const entry = { examId: exam.id, examStatus: String(exam.data().status ?? "UNKNOWN") };
      usage.set(item.id, [...(usage.get(item.id) ?? []), entry]);
    }
  });
  return usage;
}

export async function listQuestions(db: Firestore, filter: { subjectId?: string; status?: QuestionStatus } = {}) {
  let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.questions);
  if (filter.subjectId) query = query.where("subjectId", "==", filter.subjectId);
  if (filter.status) query = query.where("status", "==", filter.status);
  const snap = await query.get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      subjectId: d.subjectId,
      chapterId: d.chapterId,
      lessonId: d.lessonId,
      type: d.type as QuestionType,
      statement: d.statement,
      statementAr: d.statementAr ?? "",
      difficulty: d.difficulty as QuestionDifficulty,
      status: d.status as QuestionStatus,
      usedInExams: 0,
    } satisfies QuestionListItem;
  });
}

export async function getQuestionDetail(db: Firestore, questionId: string): Promise<QuestionDetail | null> {
  const snap = await db.collection(COLLECTIONS.questions).doc(questionId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const [optionsSnap, keySnap, usage] = await Promise.all([
    db.collection(COLLECTIONS.questionOptions).where("questionId", "==", questionId).get(),
    db.collection(COLLECTIONS.questionAnswerKeys).doc(questionId).get(),
    questionExamUsage(db, questionId),
  ]);
  const options = optionsSnap.docs
    .map((doc) => ({
      id: doc.id.slice(questionId.length + 2),
      text: doc.data().text,
      textAr: doc.data().textAr ?? "",
      order: doc.data().order,
    }))
    .sort((a, b) => a.order - b.order);
  const correctDocId = keySnap.data()?.correctOptionId as string | undefined;

  return {
    id: snap.id,
    subjectId: d.subjectId,
    chapterId: d.chapterId,
    lessonId: d.lessonId,
    type: d.type,
    statement: d.statement,
    statementAr: d.statementAr ?? "",
    mediaReferences: d.mediaReferences ?? [],
    difficulty: d.difficulty,
    explanation: d.explanation ?? "",
    explanationAr: d.explanationAr ?? "",
    status: d.status,
    options,
    correctOptionId: correctDocId ? correctDocId.slice(questionId.length + 2) : options[0]?.id ?? "",
    locked: isContentLocked(usage.map((u) => u.examStatus)),
    lockedBy: usage.filter((u) => u.examStatus !== "DRAFT"),
  };
}

async function requireLessonPlacement(db: Firestore, input: QuestionInput) {
  const [lesson, chapter] = await Promise.all([
    db.collection(COLLECTIONS.lessons).doc(input.lessonId).get(),
    db.collection(COLLECTIONS.chapters).doc(input.chapterId).get(),
  ]);
  if (!lesson.exists || lesson.data()?.chapterId !== input.chapterId || lesson.data()?.subjectId !== input.subjectId) {
    throw new DomainError("الدرس لا ينتمي إلى الفصل أو المادة المختارة.");
  }
  if (!chapter.exists || chapter.data()?.subjectId !== input.subjectId) {
    throw new DomainError("الفصل لا ينتمي إلى المادة المختارة.");
  }
}

function contentOf(input: QuestionInput): QuestionContent {
  return {
    type: input.type,
    statement: input.statement,
    statementAr: input.statementAr,
    explanation: input.explanation,
    explanationAr: input.explanationAr,
    correctOptionId: input.correctOptionId,
    options: input.options.map((o) => ({ id: o.id, text: o.text, textAr: o.textAr, order: o.order })),
  };
}

export async function createQuestion(db: Firestore, actorUid: string, input: QuestionInput): Promise<string> {
  await requireLessonPlacement(db, input);
  const ref = db.collection(COLLECTIONS.questions).doc();
  const batch = db.batch();
  batch.set(ref, {
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    lessonId: input.lessonId,
    type: input.type,
    statement: input.statement,
    statementAr: input.statementAr,
    mediaReferences: input.mediaReferences,
    difficulty: input.difficulty,
    explanation: input.explanation,
    explanationAr: input.explanationAr,
    status: input.status,
    createdBy: actorUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const option of input.options) {
    batch.set(db.collection(COLLECTIONS.questionOptions).doc(optionDocId(ref.id, option.id)), {
      questionId: ref.id,
      text: option.text,
      textAr: option.textAr,
      order: option.order,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.set(db.collection(COLLECTIONS.questionAnswerKeys).doc(ref.id), {
    correctOptionId: optionDocId(ref.id, input.correctOptionId),
    updatedBy: actorUid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const audit = auditLogWrite(db, actorUid, { action: "QUESTION_CREATED", targetType: "question", targetId: ref.id });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return ref.id;
}

export async function updateQuestion(db: Firestore, actorUid: string, questionId: string, input: QuestionInput) {
  const ref = db.collection(COLLECTIONS.questions).doc(questionId);
  const existing = await ref.get();
  if (!existing.exists) throw new DomainError("السؤال غير موجود.");
  if (existing.data()?.subjectId !== input.subjectId) {
    throw new DomainError("لا يمكن تغيير مادة السؤال بعد إنشائه.");
  }
  await requireLessonPlacement(db, input);

  const usage = await questionExamUsage(db, questionId);
  const locked = isContentLocked(usage.map((u) => u.examStatus));

  const current = await getQuestionDetail(db, questionId);
  if (locked && current) {
    // Compare stored content against the incoming content, never input against itself.
    const changed = changedContentFields(contentOf(current), contentOf(input));
    if (changed.length > 0) {
      const labels = changed.map((field) => CONTENT_FIELD_LABELS[field] ?? field).join("، ");
      throw new DomainError(
        `هذا السؤال مستخدم في امتحان منشور أو مغلق، لذلك لا يمكن تغيير: ${labels}. يمكن تعديل الدرس والصعوبة والحالة فقط.`,
      );
    }
  }

  const batch = db.batch();
  batch.update(ref, {
    lessonId: input.lessonId,
    chapterId: input.chapterId,
    difficulty: input.difficulty,
    status: input.status,
    type: input.type,
    statement: input.statement,
    statementAr: input.statementAr,
    mediaReferences: input.mediaReferences,
    explanation: input.explanation,
    explanationAr: input.explanationAr,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const keepIds = new Set(input.options.map((o) => optionDocId(questionId, o.id)));
  const optionsSnap = await db.collection(COLLECTIONS.questionOptions).where("questionId", "==", questionId).get();
  for (const doc of optionsSnap.docs) {
    if (!keepIds.has(doc.id)) batch.delete(doc.ref);
  }
  for (const option of input.options) {
    batch.set(
      db.collection(COLLECTIONS.questionOptions).doc(optionDocId(questionId, option.id)),
      {
        questionId,
        text: option.text,
        textAr: option.textAr,
        order: option.order,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  batch.set(db.collection(COLLECTIONS.questionAnswerKeys).doc(questionId), {
    correctOptionId: optionDocId(questionId, input.correctOptionId),
    updatedBy: actorUid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const audit = auditLogWrite(db, actorUid, {
    action: "QUESTION_UPDATED",
    targetType: "question",
    targetId: questionId,
    metadata: { locked },
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}
