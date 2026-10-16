import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  computeTotals,
  readinessIssues,
  toPublishEntries,
  type BankQuestionView,
  type CompositionItem,
} from "@/features/exams/composition";
import { changedContentFields, isContentLocked, type QuestionContent } from "@/features/questions/content-lock";

const bank = (overrides: Partial<BankQuestionView> = {}): BankQuestionView => ({
  id: "q1",
  subjectId: "s1",
  chapterId: "c1",
  lessonId: "l1",
  type: "SINGLE_CHOICE",
  statement: "Q",
  statementAr: "س",
  explanation: "because",
  explanationAr: "لأن",
  difficulty: "EASY",
  mediaReferences: [],
  status: "READY",
  ...overrides,
});

const options = [
  { id: "o2", text: "B", textAr: "ب", order: 2 },
  { id: "o1", text: "A", textAr: "أ", order: 1 },
];

function item(overrides: Partial<CompositionItem> = {}): CompositionItem {
  return {
    examQuestionId: "q1",
    questionId: "q1",
    order: 1,
    points: 2,
    bank: bank(),
    options,
    correctOptionId: "o1",
    ...overrides,
  };
}

describe("snapshot building", () => {
  it("sorts options by order and never includes a correctness field", () => {
    const { optionsSnapshot, questionSnapshot } = buildSnapshot(bank(), options);
    expect(optionsSnapshot.map((o) => o.optionId)).toEqual(["o1", "o2"]);
    const serialized = JSON.stringify({ optionsSnapshot, questionSnapshot });
    expect(serialized).not.toContain("correct");
    expect(Object.keys(optionsSnapshot[0]).sort()).toEqual(["optionId", "order", "text", "textAr"]);
  });

  it("copies media so later bank edits cannot mutate the snapshot", () => {
    const source = bank({ mediaReferences: ["https://example.test/a.png"] });
    const { questionSnapshot } = buildSnapshot(source, options);
    source.mediaReferences.push("https://example.test/b.png");
    expect(questionSnapshot.mediaReferences).toHaveLength(1);
  });
});

describe("totals and publish entries", () => {
  it("sums points and collects unique chapters and lessons", () => {
    const items = [
      item({ questionId: "q1", examQuestionId: "q1", points: 2 }),
      item({ questionId: "q2", examQuestionId: "q2", order: 2, points: 3, bank: bank({ id: "q2", chapterId: "c2", lessonId: "l1" }) }),
      item({ questionId: "q3", examQuestionId: "q3", order: 3, points: 1, bank: bank({ id: "q3", chapterId: "c1", lessonId: "l2" }) }),
    ];
    expect(computeTotals(items)).toEqual({
      questionCount: 3,
      maxScore: 6,
      chapterIds: ["c1", "c2"],
      lessonIds: ["l1", "l2"],
    });
  });

  it("flags archived bank questions as publish blockers", () => {
    const { issues } = toPublishEntries([item({ bank: bank({ status: "ARCHIVED" }) })]);
    expect(issues).toHaveLength(1);
  });

  it("flags questions deleted from the bank", () => {
    const { issues, entries } = toPublishEntries([item({ bank: null })]);
    expect(entries).toHaveLength(0);
    expect(issues).toHaveLength(1);
  });
});

describe("readiness", () => {
  it("is empty for a consistent, keyed exam", () => {
    expect(readinessIssues([item()], 1800)).toEqual([]);
  });

  it("reports a missing answer key", () => {
    expect(readinessIssues([item({ correctOptionId: null })], 1800)).toContain("يوجد سؤال بلا إجابة صحيحة.");
  });

  it("reports a stored maximum score that no longer matches the points", () => {
    expect(readinessIssues([item({ points: 2 })], 1800, 5).join(" ")).toContain("الدرجة النهائية");
  });

  it("reports an empty exam", () => {
    expect(readinessIssues([], 1800)).not.toEqual([]);
  });
});

describe("content lock", () => {
  const before: QuestionContent = {
    type: "SINGLE_CHOICE",
    statement: "Q",
    statementAr: "س",
    explanation: "",
    explanationAr: "",
    correctOptionId: "o1",
    options: [{ id: "o1", text: "A", textAr: "أ", order: 1 }, { id: "o2", text: "B", textAr: "ب", order: 2 }],
  };

  it("locks once any exam that uses the question is not a draft", () => {
    expect(isContentLocked([])).toBe(false);
    expect(isContentLocked(["DRAFT", "DRAFT"])).toBe(false);
    expect(isContentLocked(["DRAFT", "PUBLISHED"])).toBe(true);
    expect(isContentLocked(["CLOSED"])).toBe(true);
  });

  it("detects a changed statement, explanation, correct answer, or option text", () => {
    expect(changedContentFields(before, { ...before, statement: "Q2" })).toEqual(["statement"]);
    expect(changedContentFields(before, { ...before, explanationAr: "شرح" })).toEqual(["explanationAr"]);
    expect(changedContentFields(before, { ...before, correctOptionId: "o2" })).toEqual(["correctOptionId"]);
    expect(
      changedContentFields(before, { ...before, options: [before.options[0], { ...before.options[1], text: "C" }] }),
    ).toEqual(["options"]);
  });

  it("treats identical content and a reordered-but-equal option list as unchanged", () => {
    expect(changedContentFields(before, { ...before, options: [...before.options].reverse() })).toEqual([]);
  });

  it("detects added or removed options", () => {
    expect(changedContentFields(before, { ...before, options: [before.options[0]] })).toEqual(["options"]);
  });
});
