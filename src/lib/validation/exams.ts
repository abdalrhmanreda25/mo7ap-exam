import { z } from "zod";
import { EXAM_STATUSES } from "@/types/firestore";

export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 6 * 60 * 60;
export const MAX_QUESTIONS_PER_EXAM = 200;
export const MAX_POINTS_PER_QUESTION = 100;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, { error: "معرّف غير صالح." });

/** Exam configuration as edited by the admin. Status and version are server-owned. */
export const examConfigSchema = z.object({
  title: z.string().trim().min(1).max(200),
  titleAr: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  subjectId: id,
  chapterIds: z.array(id).max(50).default([]),
  lessonIds: z.array(id).max(200).default([]),
  academicYear: z.string().trim().min(1).max(40),
  durationSeconds: z
    .number()
    .int()
    .min(MIN_DURATION_SECONDS, { error: "مدة الامتحان قصيرة جدًا." })
    .max(MAX_DURATION_SECONDS, { error: "مدة الامتحان طويلة جدًا." }),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  showScoreAfterSubmit: z.boolean(),
  showCorrectAnswersAfterSubmit: z.boolean(),
  showExplanationsAfterSubmit: z.boolean(),
});
export type ExamConfig = z.infer<typeof examConfigSchema>;

/** Review policy defaults: score visible, answers and explanations held back. */
export const DEFAULT_REVIEW_POLICY = {
  showScoreAfterSubmit: true,
  showCorrectAnswersAfterSubmit: false,
  showExplanationsAfterSubmit: false,
} as const;

export const examStatusSchema = z.enum(EXAM_STATUSES);

/** One entry of the composed exam, as read by publish validation. */
export interface ExamEntry {
  questionId: string;
  order: number;
  points: number;
  type: "SINGLE_CHOICE" | "TRUE_FALSE";
  optionIds: string[];
  correctOptionId: string | null;
}

export interface PublishIssue {
  code:
    | "NO_QUESTIONS"
    | "QUESTION_COUNT_MISMATCH"
    | "DUPLICATE_QUESTION"
    | "ORDER_NOT_CONTIGUOUS"
    | "INVALID_POINTS"
    | "MAX_SCORE_MISMATCH"
    | "MISSING_ANSWER_KEY"
    | "INVALID_OPTIONS"
    | "TOO_MANY_QUESTIONS"
    | "INVALID_DURATION";
  message: string;
}

/**
 * Pure publish gate. Returns every problem, not just the first.
 * Publish (Phase 3 server code) refuses to run while this list is non-empty.
 */
export function validateExamForPublish(input: {
  durationSeconds: number;
  questionCount: number;
  maxScore: number;
  entries: ExamEntry[];
}): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const { entries } = input;

  if (entries.length === 0) {
    issues.push({ code: "NO_QUESTIONS", message: "الامتحان لا يحتوي أسئلة." });
    return issues;
  }
  if (entries.length > MAX_QUESTIONS_PER_EXAM) {
    issues.push({ code: "TOO_MANY_QUESTIONS", message: "عدد الأسئلة يتجاوز الحد المسموح." });
  }
  if (input.questionCount !== entries.length) {
    issues.push({ code: "QUESTION_COUNT_MISMATCH", message: "عدد الأسئلة المعلن لا يطابق الأسئلة الفعلية." });
  }
  if (
    !Number.isInteger(input.durationSeconds) ||
    input.durationSeconds < MIN_DURATION_SECONDS ||
    input.durationSeconds > MAX_DURATION_SECONDS
  ) {
    issues.push({ code: "INVALID_DURATION", message: "مدة الامتحان غير صالحة." });
  }

  const questionIds = new Set<string>();
  for (const entry of entries) {
    if (questionIds.has(entry.questionId)) {
      issues.push({ code: "DUPLICATE_QUESTION", message: "السؤال مكرر في الامتحان." });
    }
    questionIds.add(entry.questionId);
  }

  const orders = entries.map((entry) => entry.order).sort((a, b) => a - b);
  if (orders.some((order, index) => order !== index + 1)) {
    issues.push({ code: "ORDER_NOT_CONTIGUOUS", message: "ترتيب الأسئلة يجب أن يكون متتابعًا من 1." });
  }

  if (
    entries.some(
      (entry) =>
        !Number.isInteger(entry.points) || entry.points < 1 || entry.points > MAX_POINTS_PER_QUESTION,
    )
  ) {
    issues.push({ code: "INVALID_POINTS", message: "درجات الأسئلة غير صالحة." });
  }

  const total = entries.reduce((sum, entry) => sum + entry.points, 0);
  if (total !== input.maxScore) {
    issues.push({ code: "MAX_SCORE_MISMATCH", message: "مجموع الدرجات لا يطابق الدرجة النهائية." });
  }

  if (entries.some((entry) => entry.correctOptionId === null)) {
    issues.push({ code: "MISSING_ANSWER_KEY", message: "يوجد سؤال بلا إجابة صحيحة." });
  }

  for (const entry of entries) {
    const count = entry.optionIds.length;
    const expectedValid = entry.type === "TRUE_FALSE" ? count === 2 : count >= 2 && count <= 6;
    const keyInOptions =
      entry.correctOptionId !== null && entry.optionIds.includes(entry.correctOptionId);
    if (!expectedValid || (entry.correctOptionId !== null && !keyInOptions)) {
      issues.push({ code: "INVALID_OPTIONS", message: "خيارات السؤال غير صالحة." });
      break;
    }
  }

  return issues;
}
