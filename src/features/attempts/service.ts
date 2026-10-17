import "server-only";

import { randomInt } from "node:crypto";
import { Timestamp, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { attemptIdFor, resultIdFor } from "@/lib/domain/ids";
import { canTransitionAttempt, decideAnswerSave, decideStart, isDeadlinePassed } from "@/lib/domain/state";
import { DomainError } from "@/lib/server/errors";
import { COLLECTIONS, type AttemptStatus, type QuestionType } from "@/types/firestore";

/** Fisher-Yates with a CSPRNG. Order is fixed per attempt once stored, so reloads see the same order. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const millisOf = (value: unknown): number => (value as Timestamp).toMillis();

export interface ExamViewQuestion {
  examQuestionId: string;
  order: number;
  points: number;
  type: QuestionType;
  statement: string;
  statementAr: string;
  explanation: string;
  explanationAr: string;
  options: { id: string; text: string; textAr: string }[];
}

export interface AttemptView {
  attemptId: string;
  examId: string;
  examTitle: string;
  examTitleAr: string;
  status: AttemptStatus;
  deadlineMs: number;
  serverNowMs: number;
  questions: ExamViewQuestion[];
  /** Server-confirmed answers only. Local, unsaved selections live in the browser. */
  answers: Record<string, string>;
  result: null | {
    score: number | null;
    maxScore: number;
    percentage: number | null;
    /** Present only when the exam's review policy allows it. */
    correct: Record<string, string> | null;
    explanations: Record<string, string> | null;
  };
}

interface ExamDoc {
  title: string;
  titleAr: string;
  status: string;
  archived: boolean;
  durationSeconds: number;
  maxScore: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showScoreAfterSubmit: boolean;
  showCorrectAnswersAfterSubmit: boolean;
  showExplanationsAfterSubmit: boolean;
  version: number;
  subjectId: string;
  description?: string;
  questionCount: number;
}

async function examDoc(db: Firestore, examId: string): Promise<ExamDoc | null> {
  const snap = await db.collection(COLLECTIONS.exams).doc(examId).get();
  return snap.exists ? (snap.data() as ExamDoc) : null;
}

export async function getAttemptIdState(db: Firestore, studentId: string, examId: string) {
  const snap = await db.collection(COLLECTIONS.attempts).doc(attemptIdFor(examId, studentId)).get();
  if (!snap.exists) return null;
  return { attemptId: snap.id, status: snap.data()!.status as AttemptStatus };
}

/**
 * Starts the single attempt for (student, exam). The attempt ID is deterministic, so concurrent
 * starts serialize inside the transaction and only one attempt can exist. A second call returns the existing attempt.
 */
export async function startExam(db: Firestore, studentId: string, examId: string): Promise<string> {
  const examRef = db.collection(COLLECTIONS.exams).doc(examId);
  const attemptRef = db.collection(COLLECTIONS.attempts).doc(attemptIdFor(examId, studentId));

  return db.runTransaction(async (tx) => {
    const attemptSnap = await tx.get(attemptRef);
    if (attemptSnap.exists) return attemptRef.id;

    const examSnap = await tx.get(examRef);
    if (!examSnap.exists) throw new DomainError("الامتحان غير موجود.");
    const exam = examSnap.data() as ExamDoc;
    const decision = decideStart({ status: exam.status as "PUBLISHED", archived: exam.archived });
    if (!decision.allowed) {
      throw new DomainError(decision.reason === "EXAM_ARCHIVED" ? "هذا الامتحان مؤرشف." : "هذا الامتحان غير متاح الآن.");
    }

    const questionsSnap = await tx.get(examRef.collection(COLLECTIONS.examQuestions));
    const questions = questionsSnap.docs
      .map((doc) => ({
        id: doc.id,
        order: doc.data().order as number,
        optionIds: (doc.data().optionsSnapshot as { optionId: string }[]).map((o) => o.optionId),
      }))
      .sort((a, b) => a.order - b.order);
    if (questions.length === 0) throw new DomainError("الامتحان لا يحتوي أسئلة.");

    const now = Date.now();
    const questionOrder = exam.shuffleQuestions ? shuffle(questions.map((q) => q.id)) : questions.map((q) => q.id);
    const optionOrders = Object.fromEntries(
      questions.map((q) => [q.id, exam.shuffleOptions ? shuffle(q.optionIds) : q.optionIds]),
    );

    tx.set(attemptRef, {
      examId,
      studentId,
      subjectId: exam.subjectId,
      status: "IN_PROGRESS",
      startedAt: Timestamp.fromMillis(now),
      deadlineAt: Timestamp.fromMillis(now + exam.durationSeconds * 1000),
      submittedAt: null,
      score: null,
      maxScore: exam.maxScore,
      examVersion: exam.version,
      gradingVersion: 1,
      lastSavedAt: null,
      questionOrder,
      optionOrders,
      createdAt: Timestamp.fromMillis(now),
      updatedAt: Timestamp.fromMillis(now),
    });
    return attemptRef.id;
  });
}

/** Grades an attempt from the answers saved so far. Idempotent: an already-final attempt is returned unchanged. */
async function finalize(db: Firestore, attemptId: string, submittedAtMs: number): Promise<void> {
  const attemptRef = db.collection(COLLECTIONS.attempts).doc(attemptId);
  await db.runTransaction(async (tx: Transaction) => {
    const attemptSnap = await tx.get(attemptRef);
    if (!attemptSnap.exists) return;
    const attempt = attemptSnap.data()!;
    if (attempt.status !== "IN_PROGRESS") return;

    const examId = attempt.examId as string;
    const examRef = db.collection(COLLECTIONS.exams).doc(examId);
    const resultRef: DocumentReference = db.collection(COLLECTIONS.results).doc(resultIdFor(attemptId));

    // All reads first, then writes.
    const [answersSnap, keysSnap, resultSnap] = await Promise.all([
      tx.get(attemptRef.collection(COLLECTIONS.attemptAnswers)),
      tx.get(db.collection(COLLECTIONS.examAnswerKeys).doc(examId).collection("items")),
      tx.get(resultRef),
    ]);
    const examSnap = await tx.get(examRef);
    const exam = examSnap.data() as ExamDoc;

    const selected = new Map(answersSnap.docs.map((d) => [d.id, d.data().selectedOptionId as string]));
    const keys = new Map(keysSnap.docs.map((d) => [d.id, d.data() as { correctOptionId: string; points: number }]));

    let score = 0;
    let maxScore = 0;
    for (const [questionId, key] of keys) {
      maxScore += key.points;
      if (selected.get(questionId) === key.correctOptionId) score += key.points;
    }
    const percentage = maxScore === 0 ? 0 : Math.round((score / maxScore) * 10000) / 100;

    if (!canTransitionAttempt("IN_PROGRESS", "SUBMITTED")) throw new DomainError("انتقال الحالة غير مسموح.");
    const submittedAt = Timestamp.fromMillis(submittedAtMs);
    tx.update(attemptRef, {
      status: "GRADED",
      score,
      maxScore,
      submittedAt,
      gradingVersion: 1,
      updatedAt: Timestamp.fromMillis(Date.now()),
    });
    if (!resultSnap.exists) {
      tx.set(resultRef, {
        studentId: attempt.studentId,
        examId,
        subjectId: exam.subjectId,
        attemptId,
        score,
        maxScore,
        percentage,
        submittedAt,
        gradingVersion: 1,
        createdAt: Timestamp.fromMillis(Date.now()),
      });
    }
  });
}

/** Student submit. Returns the final state. Repeating it changes nothing. */
export async function submitAttempt(db: Firestore, studentId: string, attemptId: string): Promise<void> {
  const snap = await db.collection(COLLECTIONS.attempts).doc(attemptId).get();
  if (!snap.exists || snap.data()!.studentId !== studentId) throw new DomainError("المحاولة غير موجودة.");
  const deadline = millisOf(snap.data()!.deadlineAt);
  const now = Date.now();
  await finalize(db, attemptId, Math.min(now, deadline));
}

/**
 * Saves one answer. A stale request (lower or equal seq than the stored one) is ignored, so a late retry
 * cannot overwrite a newer choice. Rejected after the server deadline.
 */
export async function saveAnswer(
  db: Firestore,
  studentId: string,
  attemptId: string,
  examQuestionId: string,
  selectedOptionId: string,
  seq: number,
): Promise<{ saved: boolean; reason?: "NOT_IN_PROGRESS" | "DEADLINE_PASSED" }> {
  const attemptRef = db.collection(COLLECTIONS.attempts).doc(attemptId);
  const answerRef = attemptRef.collection(COLLECTIONS.attemptAnswers).doc(examQuestionId);

  return db.runTransaction(async (tx) => {
    const attemptSnap = await tx.get(attemptRef);
    if (!attemptSnap.exists || attemptSnap.data()!.studentId !== studentId) throw new DomainError("المحاولة غير موجودة.");
    const attempt = attemptSnap.data()!;

    const decision = decideAnswerSave(
      { status: attempt.status as AttemptStatus, deadlineMs: millisOf(attempt.deadlineAt) },
      Date.now(),
    );
    if (!decision.allowed) return { saved: false, reason: decision.reason };

    const order = attempt.questionOrder as string[];
    const optionOrders = attempt.optionOrders as Record<string, string[]>;
    if (!order.includes(examQuestionId)) throw new DomainError("السؤال لا ينتمي إلى هذه المحاولة.");
    if (!optionOrders[examQuestionId]?.includes(selectedOptionId)) throw new DomainError("الخيار غير صالح لهذا السؤال.");

    const existing = await tx.get(answerRef);
    if (existing.exists && (existing.data()!.seq as number) >= seq) return { saved: true };

    const now = Timestamp.fromMillis(Date.now());
    tx.set(answerRef, { examQuestionId, selectedOptionId, seq, savedAt: now });
    tx.update(attemptRef, { lastSavedAt: now, updatedAt: now });
    return { saved: true };
  });
}

/** Finalizes an expired attempt on access, using only the answers saved before the deadline. */
export async function getAttemptView(db: Firestore, studentId: string, attemptId: string): Promise<AttemptView | null> {
  const attemptRef = db.collection(COLLECTIONS.attempts).doc(attemptId);
  let snap = await attemptRef.get();
  if (!snap.exists || snap.data()!.studentId !== studentId) return null;

  if (snap.data()!.status === "IN_PROGRESS" && isDeadlinePassed(millisOf(snap.data()!.deadlineAt), Date.now())) {
    await finalize(db, attemptId, millisOf(snap.data()!.deadlineAt));
    snap = await attemptRef.get();
  }
  const attempt = snap.data()!;
  const examId = attempt.examId as string;
  const exam = await examDoc(db, examId);
  if (!exam) return null;

  const [questionsSnap, answersSnap] = await Promise.all([
    db.collection(COLLECTIONS.exams).doc(examId).collection(COLLECTIONS.examQuestions).get(),
    attemptRef.collection(COLLECTIONS.attemptAnswers).get(),
  ]);
  const byId = new Map(questionsSnap.docs.map((d) => [d.id, d.data()]));
  const order = attempt.questionOrder as string[];
  const optionOrders = attempt.optionOrders as Record<string, string[]>;
  const finished = attempt.status !== "IN_PROGRESS";

  const questions: ExamViewQuestion[] = order.map((qid, index) => {
    const q = byId.get(qid)!;
    const snapshot = q.questionSnapshot as ExamViewQuestion & { type: QuestionType };
    const optionsById = new Map((q.optionsSnapshot as { optionId: string; text: string; textAr: string }[]).map((o) => [o.optionId, o]));
    return {
      examQuestionId: qid,
      order: index + 1,
      points: q.points as number,
      type: snapshot.type,
      statement: snapshot.statement,
      statementAr: snapshot.statementAr,
      explanation: finished && exam.showExplanationsAfterSubmit ? snapshot.explanation : "",
      explanationAr: finished && exam.showExplanationsAfterSubmit ? snapshot.explanationAr : "",
      options: optionOrders[qid].map((oid) => {
        const o = optionsById.get(oid)!;
        return { id: o.optionId, text: o.text, textAr: o.textAr };
      }),
    };
  });

  let result: AttemptView["result"] = null;
  if (finished) {
    let correct: Record<string, string> | null = null;
    let explanations: Record<string, string> | null = null;
    if (exam.showCorrectAnswersAfterSubmit) {
      const keys = await db.collection(COLLECTIONS.examAnswerKeys).doc(examId).collection("items").get();
      correct = Object.fromEntries(keys.docs.map((d) => [d.id, d.data().correctOptionId as string]));
    }
    if (exam.showExplanationsAfterSubmit) {
      explanations = Object.fromEntries(questions.map((q) => [q.examQuestionId, q.explanationAr || q.explanation]));
    }
    const showScore = exam.showScoreAfterSubmit;
    const score = showScore ? (attempt.score as number) : null;
    const maxScore = attempt.maxScore as number;
    result = {
      score,
      maxScore,
      percentage: showScore && maxScore > 0 ? Math.round(((attempt.score as number) / maxScore) * 10000) / 100 : null,
      correct,
      explanations,
    };
  }

  return {
    attemptId,
    examId,
    examTitle: exam.title,
    examTitleAr: exam.titleAr,
    status: attempt.status as AttemptStatus,
    deadlineMs: millisOf(attempt.deadlineAt),
    serverNowMs: Date.now(),
    questions,
    answers: Object.fromEntries(answersSnap.docs.map((d) => [d.id, d.data().selectedOptionId as string])),
    result,
  };
}

export async function listPublishedExams(db: Firestore) {
  const snap = await db.collection(COLLECTIONS.exams).where("status", "==", "PUBLISHED").get();
  return snap.docs
    .map((doc) => ({
      id: doc.id,
      titleAr: doc.data().titleAr as string,
      title: doc.data().title as string,
      durationSeconds: doc.data().durationSeconds as number,
      questionCount: doc.data().questionCount as number,
      maxScore: doc.data().maxScore as number,
    }))
    .sort((a, b) => a.titleAr.localeCompare(b.titleAr, "ar"));
}

export async function getExamForStudent(db: Firestore, examId: string) {
  const snap = await db.collection(COLLECTIONS.exams).doc(examId).get();
  if (!snap.exists) return null;
  const exam = snap.data() as ExamDoc & { description?: string; questionCount: number };
  if (exam.status !== "PUBLISHED" || exam.archived) return null;
  return { ...exam, id: snap.id, description: exam.description ?? "" };
}

