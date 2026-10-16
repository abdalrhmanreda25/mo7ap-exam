import { describe, expect, it } from "vitest";
import { validateExamForPublish, type ExamEntry } from "@/lib/validation/exams";

function entry(overrides: Partial<ExamEntry> = {}): ExamEntry {
  return {
    questionId: "q1",
    order: 1,
    points: 2,
    type: "SINGLE_CHOICE",
    optionIds: ["o1", "o2", "o3"],
    correctOptionId: "o1",
    ...overrides,
  };
}

const validExam = {
  durationSeconds: 1800,
  questionCount: 2,
  maxScore: 4,
  entries: [entry(), entry({ questionId: "q2", order: 2, points: 2 })],
};

const codes = (input: Partial<typeof validExam>) =>
  validateExamForPublish({ ...validExam, ...input }).map((issue) => issue.code);

describe("publish validation", () => {
  it("accepts a consistent exam", () => {
    expect(validateExamForPublish(validExam)).toEqual([]);
  });

  it("reports an empty exam", () => {
    expect(codes({ entries: [], questionCount: 0, maxScore: 0 })).toEqual(["NO_QUESTIONS"]);
  });

  it("reports a declared question count that does not match", () => {
    expect(codes({ questionCount: 5 })).toContain("QUESTION_COUNT_MISMATCH");
  });

  it("reports a maximum score that does not equal the sum of points", () => {
    expect(codes({ maxScore: 10 })).toContain("MAX_SCORE_MISMATCH");
  });

  it("reports a duplicate question", () => {
    const entries = [entry(), entry({ order: 2 })];
    expect(codes({ entries, questionCount: 2 })).toContain("DUPLICATE_QUESTION");
  });

  it("reports non-contiguous order", () => {
    const entries = [entry(), entry({ questionId: "q2", order: 3 })];
    expect(codes({ entries, questionCount: 2 })).toContain("ORDER_NOT_CONTIGUOUS");
  });

  it("reports invalid points", () => {
    const entries = [entry({ points: 0 }), entry({ questionId: "q2", order: 2, points: 4 })];
    expect(codes({ entries, maxScore: 4 })).toContain("INVALID_POINTS");
  });

  it("reports a missing answer key", () => {
    const entries = [entry({ correctOptionId: null }), entry({ questionId: "q2", order: 2 })];
    expect(codes({ entries })).toContain("MISSING_ANSWER_KEY");
  });

  it("reports a key that is not one of the options", () => {
    const entries = [entry({ correctOptionId: "ghost" }), entry({ questionId: "q2", order: 2 })];
    expect(codes({ entries })).toContain("INVALID_OPTIONS");
  });

  it("requires exactly two options for TRUE_FALSE", () => {
    const entries = [entry({ type: "TRUE_FALSE", optionIds: ["o1", "o2", "o3"] }), entry({ questionId: "q2", order: 2 })];
    expect(codes({ entries })).toContain("INVALID_OPTIONS");
  });

  it("rejects durations outside the allowed window", () => {
    expect(codes({ durationSeconds: 30 })).toContain("INVALID_DURATION");
    expect(codes({ durationSeconds: 6 * 60 * 60 + 1 })).toContain("INVALID_DURATION");
    expect(codes({ durationSeconds: 1.5 })).toContain("INVALID_DURATION");
  });

  it("reports every problem, not only the first", () => {
    const issues = codes({ durationSeconds: 10, maxScore: 99, questionCount: 9 });
    expect(issues).toEqual(expect.arrayContaining(["INVALID_DURATION", "MAX_SCORE_MISMATCH", "QUESTION_COUNT_MISMATCH"]));
  });
});
