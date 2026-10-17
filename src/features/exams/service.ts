import "server-only";

import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QuerySnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { auditLogWrite } from "@/lib/audit/log";
import { DomainError } from "@/lib/server/errors";
import { canTransitionExam } from "@/lib/domain/state";
import type { ExamConfig } from "@/lib/validation/exams";
import { COLLECTIONS, type ExamStatus, type QuestionType } from "@/types/firestore";
import {
  buildSnapshot,
  computeTotals,
  readinessIssues,
  type BankOptionView,
  type BankQuestionView,
  type CompositionItem,
} from "./composition";

export interface ExamDto extends ExamConfig {
  id: string;
  status: ExamStatus;
  archived: boolean;
  questionCount: number;
  maxScore: number;
  chapterIds: string[];
  lessonIds: string[];
  version: number;
}

export interface CompositionView extends CompositionItem {
  statementAr: string;
  type: QuestionType | null;
}

/** Reads go through this so the same code runs inside a transaction or directly. */
interface Reader {
  doc(ref: DocumentReference): Promise<DocumentSnapshot>;
  query(query: Query): Promise<QuerySnapshot>;
}

const directReader = (): Reader => ({
  doc: (ref) => ref.get(),
  query: (query) => query.get(),
});

const txReader = (tx: Transaction): Reader => ({
  doc: (ref) => tx.get(ref),
  query: (query) => tx.get(query),
});

const configFields = (config: ExamConfig) => ({
  title: config.title,
  titleAr: config.titleAr,
  description: config.description,
  academicYear: config.academicYear,
  durationSeconds: config.durationSeconds,
  shuffleQuestions: config.shuffleQuestions,
  shuffleOptions: config.shuffleOptions,
  showScoreAfterSubmit: config.showScoreAfterSubmit,
  showCorrectAnswersAfterSubmit: config.showCorrectAnswersAfterSubmit,
  showExplanationsAfterSubmit: config.showExplanationsAfterSubmit,
});

function examDto(id: string, d: FirebaseFirestore.DocumentData): ExamDto {
  return {
    id,
    title: d.title,
    titleAr: d.titleAr,
    description: d.description ?? "",
    subjectId: d.subjectId,
    academicYear: d.academicYear,
    durationSeconds: d.durationSeconds,
    shuffleQuestions: d.shuffleQuestions,
    shuffleOptions: d.shuffleOptions,
    showScoreAfterSubmit: d.showScoreAfterSubmit,
    showCorrectAnswersAfterSubmit: d.showCorrectAnswersAfterSubmit,
    showExplanationsAfterSubmit: d.showExplanationsAfterSubmit,
    status: d.status,
    archived: d.archived,
    questionCount: d.questionCount,
    maxScore: d.maxScore,
    chapterIds: d.chapterIds ?? [],
    lessonIds: d.lessonIds ?? [],
    version: d.version,
  };
}

export async function listExams(db: Firestore): Promise<ExamDto[]> {
  const snap = await db.collection(COLLECTIONS.exams).get();
  return snap.docs
    .map((doc) => examDto(doc.id, doc.data()))
    .sort((a, b) => a.titleAr.localeCompare(b.titleAr, "ar"));
}

export async function getExam(db: Firestore, examId: string): Promise<ExamDto | null> {
  const snap = await db.collection(COLLECTIONS.exams).doc(examId).get();
  return snap.exists ? examDto(snap.id, snap.data()!) : null;
}

/** Loads the composed questions in order, each with its bank state and key. */
export async function loadComposition(db: Firestore, reader: Reader, examId: string): Promise<CompositionView[]> {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  const composed = await reader.query(examRef.collection(COLLECTIONS.examQuestions));
  const rows = composed.docs.map((doc) => ({ examQuestionId: doc.id, data: doc.data() }));
  rows.sort((a, b) => (a.data.order as number) - (b.data.order as number));

  const items: CompositionView[] = [];
  for (const row of rows) {
    const questionId = row.data.questionId as string;
    const [bankSnap, optionsSnap, keySnap] = await Promise.all([
      reader.doc(db.collection(COLLECTIONS.questions).doc(questionId)),
      reader.query(db.collection(COLLECTIONS.questionOptions).where("questionId", "==", questionId)),
      reader.doc(db.collection(COLLECTIONS.questionAnswerKeys).doc(questionId)),
    ]);
    const prefix = questionId.length + 2;
    const options: BankOptionView[] = optionsSnap.docs.map((doc) => ({
      id: doc.id.slice(prefix),
      text: doc.data().text,
      textAr: doc.data().textAr ?? "",
      order: doc.data().order,
    }));
    const keyDocId = keySnap.data()?.correctOptionId as string | undefined;
    const correct = keyDocId ? keyDocId.slice(prefix) : null;
    const bank: BankQuestionView | null = bankSnap.exists
      ? {
          id: questionId,
          subjectId: bankSnap.data()!.subjectId,
          chapterId: bankSnap.data()!.chapterId,
          lessonId: bankSnap.data()!.lessonId,
          type: bankSnap.data()!.type,
          statement: bankSnap.data()!.statement,
          statementAr: bankSnap.data()!.statementAr ?? "",
          explanation: bankSnap.data()!.explanation ?? "",
          explanationAr: bankSnap.data()!.explanationAr ?? "",
          difficulty: bankSnap.data()!.difficulty,
          mediaReferences: bankSnap.data()!.mediaReferences ?? [],
          status: bankSnap.data()!.status,
        }
      : null;

    items.push({
      examQuestionId: row.examQuestionId,
      questionId,
      order: row.data.order as number,
      points: row.data.points as number,
      bank,
      options,
      correctOptionId: correct && options.some((o) => o.id === correct) ? correct : null,
      statementAr: bank?.statementAr ?? "",
      type: bank?.type ?? null,
    });
  }
  return items;
}

async function requireExamStatus(tx: Transaction, examRef: DocumentReference, expected: ExamStatus) {
  const snap = await tx.get(examRef);
  if (!snap.exists) throw new DomainError("الامتحان غير موجود.");
  if (snap.data()!.status !== expected) {
    throw new DomainError(
      expected === "DRAFT" ? "هذا الإجراء متاح للمسودات فقط." : "هذا الإجراء غير متاح في حالة الامتحان الحالية.",
    );
  }
  return snap.data()!;
}

function totalsPatch(items: CompositionView[]) {
  const totals = computeTotals(items);
  return {
    questionCount: totals.questionCount,
    maxScore: totals.maxScore,
    chapterIds: totals.chapterIds,
    lessonIds: totals.lessonIds,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function createDraftExam(db: Firestore, actorUid: string, config: ExamConfig): Promise<string> {
  const subject = await db.collection(COLLECTIONS.subjects).doc(config.subjectId).get();
  if (!subject.exists) throw new DomainError("المادة غير موجودة.");

  const ref = db.collection(COLLECTIONS.exams).doc();
  const batch = db.batch();
  batch.set(ref, {
    ...configFields(config),
    subjectId: config.subjectId,
    chapterIds: [],
    lessonIds: [],
    status: "DRAFT",
    archived: false,
    maxAttempts: 1,
    questionCount: 0,
    maxScore: 0,
    publishedAt: null,
    createdBy: actorUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    version: 1,
  });
  const audit = auditLogWrite(db, actorUid, { action: "EXAM_CREATED", targetType: "exam", targetId: ref.id });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return ref.id;
}

export async function updateDraftExam(db: Firestore, actorUid: string, examId: string, config: ExamConfig) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  await db.runTransaction(async (tx) => {
    const exam = await requireExamStatus(tx, examRef, "DRAFT");
    if (exam.subjectId !== config.subjectId) {
      throw new DomainError("لا يمكن تغيير مادة الامتحان بعد إنشائه.");
    }
    tx.update(examRef, { ...configFields(config), updatedAt: FieldValue.serverTimestamp() });
    const audit = auditLogWrite(db, actorUid, { action: "EXAM_UPDATED", targetType: "exam", targetId: examId });
    tx.set(audit.ref, audit.data);
  });
}

export async function addQuestionToExam(
  db: Firestore,
  actorUid: string,
  examId: string,
  questionId: string,
  points: number,
) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  await db.runTransaction(async (tx) => {
    const exam = await requireExamStatus(tx, examRef, "DRAFT");
    const reader = txReader(tx);
    const items = await loadComposition(db, reader, examId);
    if (items.some((item) => item.questionId === questionId)) {
      throw new DomainError("السؤال موجود بالفعل في هذا الامتحان.");
    }

    const bankSnap = await tx.get(db.collection(COLLECTIONS.questions).doc(questionId));
    if (!bankSnap.exists) throw new DomainError("السؤال غير موجود في البنك.");
    const bankData = bankSnap.data()!;
    if (bankData.status !== "READY") throw new DomainError("يمكن إضافة الأسئلة الجاهزة فقط.");
    if (bankData.subjectId !== exam.subjectId) {
      throw new DomainError("السؤال لا ينتمي إلى مادة هذا الامتحان.");
    }

    const optionsSnap = await tx.get(
      db.collection(COLLECTIONS.questionOptions).where("questionId", "==", questionId),
    );
    const keySnap = await tx.get(db.collection(COLLECTIONS.questionAnswerKeys).doc(questionId));
    if (!keySnap.exists) throw new DomainError("أضف إجابة صحيحة للسؤال قبل إضافته إلى امتحان.");

    const bank: BankQuestionView = {
      id: questionId,
      subjectId: bankData.subjectId,
      chapterId: bankData.chapterId,
      lessonId: bankData.lessonId,
      type: bankData.type,
      statement: bankData.statement,
      statementAr: bankData.statementAr ?? "",
      explanation: bankData.explanation ?? "",
      explanationAr: bankData.explanationAr ?? "",
      difficulty: bankData.difficulty,
      mediaReferences: bankData.mediaReferences ?? [],
      status: bankData.status,
    };
    const prefix = questionId.length + 2;
    const options: BankOptionView[] = optionsSnap.docs.map((doc) => ({
      id: doc.id.slice(prefix),
      text: doc.data().text,
      textAr: doc.data().textAr ?? "",
      order: doc.data().order,
    }));
    const { questionSnapshot, optionsSnapshot } = buildSnapshot(bank, options);
    const order = items.length + 1;

    const newRef = examRef.collection(COLLECTIONS.examQuestions).doc(questionId);
    tx.set(newRef, { questionId, order, points, questionSnapshot, optionsSnapshot, questionVersion: 1 });

    const next: CompositionView[] = [
      ...items,
      {
        examQuestionId: questionId,
        questionId,
        order,
        points,
        bank,
        options,
        correctOptionId: null,
        statementAr: bank.statementAr,
        type: bank.type,
      },
    ];
    tx.update(examRef, totalsPatch(next));
    const audit = auditLogWrite(db, actorUid, {
      action: "EXAM_QUESTION_ADDED",
      targetType: "exam",
      targetId: examId,
      metadata: { questionId, points },
    });
    tx.set(audit.ref, audit.data);
  });
}

export async function removeQuestionFromExam(db: Firestore, actorUid: string, examId: string, questionId: string) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  await db.runTransaction(async (tx) => {
    await requireExamStatus(tx, examRef, "DRAFT");
    const items = await loadComposition(db, txReader(tx), examId);
    const target = items.find((item) => item.questionId === questionId);
    if (!target) throw new DomainError("السؤال غير موجود في هذا الامتحان.");

    const remaining = items.filter((item) => item.questionId !== questionId);
    remaining.forEach((item, index) => {
      if (item.order !== index + 1) {
        tx.update(examRef.collection(COLLECTIONS.examQuestions).doc(item.examQuestionId), { order: index + 1 });
        item.order = index + 1;
      }
    });
    tx.delete(examRef.collection(COLLECTIONS.examQuestions).doc(target.examQuestionId));
    tx.update(examRef, totalsPatch(remaining));
    const audit = auditLogWrite(db, actorUid, {
      action: "EXAM_QUESTION_REMOVED",
      targetType: "exam",
      targetId: examId,
      metadata: { questionId },
    });
    tx.set(audit.ref, audit.data);
  });
}

export async function moveQuestionInExam(
  db: Firestore,
  examId: string,
  questionId: string,
  direction: "up" | "down",
) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  await db.runTransaction(async (tx) => {
    await requireExamStatus(tx, examRef, "DRAFT");
    const items = await loadComposition(db, txReader(tx), examId);
    const index = items.findIndex((item) => item.questionId === questionId);
    if (index === -1) throw new DomainError("السؤال غير موجود في هذا الامتحان.");
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= items.length) return;

    const a = items[index];
    const b = items[swapWith];
    tx.update(examRef.collection(COLLECTIONS.examQuestions).doc(a.examQuestionId), { order: b.order });
    tx.update(examRef.collection(COLLECTIONS.examQuestions).doc(b.examQuestionId), { order: a.order });
  });
}

export async function setQuestionPoints(db: Firestore, examId: string, questionId: string, points: number) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  await db.runTransaction(async (tx) => {
    await requireExamStatus(tx, examRef, "DRAFT");
    const items = await loadComposition(db, txReader(tx), examId);
    const target = items.find((item) => item.questionId === questionId);
    if (!target) throw new DomainError("السؤال غير موجود في هذا الامتحان.");
    target.points = points;
    tx.update(examRef.collection(COLLECTIONS.examQuestions).doc(target.examQuestionId), { points });
    tx.update(examRef, totalsPatch(items));
  });
}

/**
 * Publish: the only path to PUBLISHED. In one transaction it
 *  1. re-validates the composition against the live bank,
 *  2. freezes each question snapshot (bank content at publish time),
 *  3. writes the answer keys to the protected examAnswerKeys collection,
 *  4. flips the status and stamps publishedAt.
 * Any failure aborts everything. Publishing twice is refused by the status check.
 */
export async function publishExam(db: Firestore, actorUid: string, examId: string) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  await db.runTransaction(async (tx) => {
    const exam = await requireExamStatus(tx, examRef, "DRAFT");

    const items = await loadComposition(db, txReader(tx), examId);
    const issues = readinessIssues(items, exam.durationSeconds, exam.maxScore);
    if (exam.questionCount !== items.length) {
      issues.push("عدد الأسئلة المسجل لا يطابق الأسئلة الفعلية.");
    }
    if (issues.length > 0) throw new DomainError("الامتحان غير جاهز للنشر.", issues);

    const keysRef = db.collection(COLLECTIONS.examAnswerKeys).doc(examId).collection("items");
    for (const item of items) {
      const bank = item.bank!;
      const { questionSnapshot, optionsSnapshot } = buildSnapshot(bank, item.options);
      tx.set(examRef.collection(COLLECTIONS.examQuestions).doc(item.examQuestionId), {
        questionId: item.questionId,
        order: item.order,
        points: item.points,
        questionSnapshot,
        optionsSnapshot,
        questionVersion: 1,
      });
      tx.set(keysRef.doc(item.examQuestionId), {
        correctOptionId: item.correctOptionId,
        points: item.points,
        gradingVersion: 1,
      });
    }

    tx.update(examRef, {
      status: "PUBLISHED",
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const audit = auditLogWrite(db, actorUid, {
      action: "EXAM_PUBLISHED",
      targetType: "exam",
      targetId: examId,
      metadata: { questionCount: items.length, maxScore: exam.maxScore },
    });
    tx.set(audit.ref, audit.data);
  });
}

/** Closing blocks new starts only. Existing attempts keep their deadline and are not erased. */
export async function closeExam(db: Firestore, actorUid: string, examId: string) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(examRef);
    if (!snap.exists) throw new DomainError("الامتحان غير موجود.");
    if (!canTransitionExam(snap.data()!.status, "CLOSED")) {
      throw new DomainError("لا يمكن إغلاق امتحان غير منشور.");
    }
    tx.update(examRef, { status: "CLOSED", updatedAt: FieldValue.serverTimestamp() });
    const audit = auditLogWrite(db, actorUid, { action: "EXAM_CLOSED", targetType: "exam", targetId: examId });
    tx.set(audit.ref, audit.data);
  });
}

export async function archiveExam(db: Firestore, actorUid: string, examId: string) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(examRef);
    if (!snap.exists) throw new DomainError("الامتحان غير موجود.");
    if (snap.data()!.status !== "CLOSED") throw new DomainError("يمكن أرشفة الامتحانات المغلقة فقط.");
    tx.update(examRef, { archived: true, updatedAt: FieldValue.serverTimestamp() });
    const audit = auditLogWrite(db, actorUid, { action: "EXAM_ARCHIVED", targetType: "exam", targetId: examId });
    tx.set(audit.ref, audit.data);
  });
}

export async function getExamComposition(db: Firestore, examId: string): Promise<CompositionView[]> {
  return loadComposition(db, directReader(), examId);
}

export async function getExamReadiness(db: Firestore, examId: string) {
  const exam = await getExam(db, examId);
  if (!exam) return null;
  const items = await getExamComposition(db, examId);
  return {
    issues: readinessIssues(items, exam.durationSeconds, exam.maxScore),
    totals: computeTotals(items),
  };
}

/** Bank questions that can be added to this exam: ready, same subject, not already composed. */
export async function listAddableQuestions(db: Firestore, subjectId: string, excludeIds: string[]) {
  const snap = await db
    .collection(COLLECTIONS.questions)
    .where("subjectId", "==", subjectId)
    .where("status", "==", "READY")
    .get();
  const exclude = new Set(excludeIds);
  return snap.docs
    .filter((doc) => !exclude.has(doc.id))
    .map((doc) => ({
      id: doc.id,
      type: doc.data().type as QuestionType,
      statement: doc.data().statement as string,
      statementAr: (doc.data().statementAr ?? "") as string,
      difficulty: doc.data().difficulty as string,
      lessonId: doc.data().lessonId as string,
    }));
}

/**
 * Hard delete. Refused when any student attempt exists, because attempts and results are history.
 * Those exams can only be archived. Deletes the question set and answer keys with the exam.
 */
export async function deleteExam(db: Firestore, actorUid: string, examId: string) {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  const exam = await examRef.get();
  if (!exam.exists) throw new DomainError("الامتحان غير موجود.");

  const attempts = await db.collection(COLLECTIONS.attempts).where("examId", "==", examId).limit(1).get();
  if (!attempts.empty) {
    throw new DomainError("لا يمكن حذف امتحان بدأه طلاب. أرشفه بدلًا من ذلك.");
  }

  const title = String(exam.data()?.titleAr ?? "");
  const audit = auditLogWrite(db, actorUid, {
    action: "EXAM_DELETED",
    targetType: "exam",
    targetId: examId,
    metadata: { titleAr: title, status: exam.data()?.status ?? null },
  });
  await audit.ref.set(audit.data);

  await db.recursiveDelete(examRef);
  await db.recursiveDelete(db.collection(COLLECTIONS.examAnswerKeys).doc(examId));
}

export async function countExamAttempts(db: Firestore, examId: string): Promise<number> {
  const snap = await db.collection(COLLECTIONS.attempts).where("examId", "==", examId).count().get();
  return snap.data().count;
}
