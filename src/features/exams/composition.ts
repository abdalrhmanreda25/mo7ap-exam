import type { OptionSnapshot, QuestionSnapshot, QuestionType } from "@/types/firestore";
import { validateExamForPublish, type ExamEntry } from "@/lib/validation/exams";

/** Bank view used to build snapshots. Carries no answer key. */
export interface BankQuestionView {
  id: string;
  subjectId: string;
  chapterId: string;
  lessonId: string;
  type: QuestionType;
  statement: string;
  statementAr: string;
  explanation: string;
  explanationAr: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  mediaReferences: string[];
  status: "DRAFT" | "READY" | "ARCHIVED";
}

export interface BankOptionView {
  id: string;
  text: string;
  textAr: string;
  order: number;
}

/** One composed question with its bank state and key, as read from Firestore. */
export interface CompositionItem {
  examQuestionId: string;
  questionId: string;
  order: number;
  points: number;
  bank: BankQuestionView | null;
  options: BankOptionView[];
  correctOptionId: string | null;
}

/**
 * Builds the frozen snapshot stored on the exam. Options are sorted by order.
 * The correct answer is deliberately not part of this output.
 */
export function buildSnapshot(
  question: BankQuestionView,
  options: BankOptionView[],
): { questionSnapshot: QuestionSnapshot; optionsSnapshot: OptionSnapshot[] } {
  return {
    questionSnapshot: {
      type: question.type,
      statement: question.statement,
      statementAr: question.statementAr,
      explanation: question.explanation,
      explanationAr: question.explanationAr,
      difficulty: question.difficulty,
      mediaReferences: [...question.mediaReferences],
    },
    optionsSnapshot: [...options]
      .sort((a, b) => a.order - b.order)
      .map((option) => ({ optionId: option.id, text: option.text, textAr: option.textAr, order: option.order })),
  };
}

export function toPublishEntries(items: CompositionItem[]): { entries: ExamEntry[]; issues: string[] } {
  const entries: ExamEntry[] = [];
  const issues: string[] = [];

  for (const item of items) {
    if (!item.bank) {
      issues.push("يوجد سؤال محذوف من البنك داخل الامتحان.");
      continue;
    }
    if (item.bank.status !== "READY") {
      issues.push(`السؤال "${item.bank.statementAr || item.bank.statement}" ليس جاهزًا للنشر.`);
    }
    entries.push({
      questionId: item.questionId,
      order: item.order,
      points: item.points,
      type: item.bank.type,
      optionIds: item.options.map((option) => option.id),
      correctOptionId: item.correctOptionId,
    });
  }
  return { entries, issues };
}

export function computeTotals(items: CompositionItem[]): {
  questionCount: number;
  maxScore: number;
  chapterIds: string[];
  lessonIds: string[];
} {
  const chapterIds = new Set<string>();
  const lessonIds = new Set<string>();
  for (const item of items) {
    if (item.bank) {
      chapterIds.add(item.bank.chapterId);
      lessonIds.add(item.bank.lessonId);
    }
  }
  return {
    questionCount: items.length,
    maxScore: items.reduce((sum, item) => sum + item.points, 0),
    chapterIds: [...chapterIds].sort(),
    lessonIds: [...lessonIds].sort(),
  };
}

/** Full publish readiness. Empty result means the exam can be published. */
export function readinessIssues(items: CompositionItem[], durationSeconds: number, storedMaxScore?: number): string[] {
  const { entries, issues } = toPublishEntries(items);
  const totals = computeTotals(items);
  const publishIssues = validateExamForPublish({
    durationSeconds,
    questionCount: totals.questionCount,
    maxScore: storedMaxScore ?? totals.maxScore,
    entries,
  });
  return [...issues, ...publishIssues.map((issue) => issue.message)];
}
