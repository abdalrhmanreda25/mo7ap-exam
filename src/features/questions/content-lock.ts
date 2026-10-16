/**
 * Content locking for bank questions. A question used by any non-draft exam is frozen:
 * its text, type, explanation, options, and correct answer cannot change. Published exams
 * already hold their own snapshots, so this lock protects the record of what was asked and
 * what was graded, and stops editors from quietly changing history.
 */

export interface QuestionContent {
  type: string;
  statement: string;
  statementAr: string;
  explanation: string;
  explanationAr: string;
  correctOptionId: string;
  options: { id: string; text: string; textAr: string; order: number }[];
}

export const CONTENT_FIELD_LABELS: Record<string, string> = {
  type: "نوع السؤال",
  statement: "نص السؤال",
  statementAr: "نص السؤال بالعربية",
  explanation: "الشرح",
  explanationAr: "الشرح بالعربية",
  options: "الخيارات",
  correctOptionId: "الإجابة الصحيحة",
};

export function isContentLocked(examStatuses: readonly string[]): boolean {
  return examStatuses.some((status) => status !== "DRAFT");
}

function sameOptions(a: QuestionContent["options"], b: QuestionContent["options"]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((option) => [option.id, option]));
  return b.every((option) => {
    const before = byId.get(option.id);
    return (
      before !== undefined &&
      before.text === option.text &&
      before.textAr === option.textAr &&
      before.order === option.order
    );
  });
}

/** Returns the labels of content fields that differ. Metadata such as difficulty is not compared. */
export function changedContentFields(before: QuestionContent, after: QuestionContent): string[] {
  const changed: string[] = [];
  if (before.type !== after.type) changed.push("type");
  if (before.statement !== after.statement) changed.push("statement");
  if (before.statementAr !== after.statementAr) changed.push("statementAr");
  if (before.explanation !== after.explanation) changed.push("explanation");
  if (before.explanationAr !== after.explanationAr) changed.push("explanationAr");
  if (!sameOptions(before.options, after.options)) changed.push("options");
  if (before.correctOptionId !== after.correctOptionId) changed.push("correctOptionId");
  return changed;
}
