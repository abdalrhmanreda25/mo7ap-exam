import { describe, expect, it } from "vitest";
import { chapterInputSchema, subjectInputSchema } from "@/lib/validation/curriculum";
import { examConfigSchema, DEFAULT_REVIEW_POLICY } from "@/lib/validation/exams";
import { questionInputSchema } from "@/lib/validation/questions";

const option = (id: string, order: number) => ({ id, text: id, textAr: id, order });

const baseQuestion = {
  subjectId: "s1",
  chapterId: "c1",
  lessonId: "l1",
  type: "SINGLE_CHOICE" as const,
  statement: "What?",
  statementAr: "ما هو؟",
  mediaReferences: [],
  difficulty: "EASY" as const,
  explanation: "",
  explanationAr: "",
  status: "READY" as const,
  options: [option("o1", 1), option("o2", 2)],
  correctOptionId: "o1",
};

describe("question input", () => {
  it("accepts a valid single-choice question", () => {
    expect(questionInputSchema.safeParse(baseQuestion).success).toBe(true);
  });

  it("rejects a correct answer that is not among the options", () => {
    const result = questionInputSchema.safeParse({ ...baseQuestion, correctOptionId: "ghost" });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate option IDs", () => {
    const result = questionInputSchema.safeParse({ ...baseQuestion, options: [option("o1", 1), option("o1", 2)] });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate option order", () => {
    const result = questionInputSchema.safeParse({ ...baseQuestion, options: [option("o1", 1), option("o2", 1)] });
    expect(result.success).toBe(false);
  });

  it("requires exactly two options for TRUE_FALSE", () => {
    const three = { ...baseQuestion, type: "TRUE_FALSE" as const, options: [option("o1", 1), option("o2", 2), option("o3", 3)] };
    expect(questionInputSchema.safeParse(three).success).toBe(false);
  });

  it("rejects unknown question types and difficulties", () => {
    expect(questionInputSchema.safeParse({ ...baseQuestion, type: "ESSAY" }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...baseQuestion, difficulty: "IMPOSSIBLE" }).success).toBe(false);
  });

  it("rejects IDs with path characters", () => {
    expect(questionInputSchema.safeParse({ ...baseQuestion, subjectId: "../x" }).success).toBe(false);
  });
});

describe("curriculum input", () => {
  const subject = {
    name: "Physics",
    nameAr: "الفيزياء",
    slug: "physics",
    academicYear: "2026",
    curriculum: "thanaweya",
    applicableTracks: ["science"],
    order: 1,
    isActive: true,
  };

  it("accepts a subject and defaults description", () => {
    const parsed = subjectInputSchema.parse(subject);
    expect(parsed.description).toBe("");
  });

  it("rejects non-slug subject identifiers", () => {
    expect(subjectInputSchema.safeParse({ ...subject, slug: "Physics Lab" }).success).toBe(false);
    expect(subjectInputSchema.safeParse({ ...subject, slug: "-bad-" }).success).toBe(false);
  });

  it("rejects fractional or negative order", () => {
    expect(subjectInputSchema.safeParse({ ...subject, order: 1.5 }).success).toBe(false);
    expect(subjectInputSchema.safeParse({ ...subject, order: -1 }).success).toBe(false);
  });

  it("validates chapter parent ID", () => {
    expect(chapterInputSchema.safeParse({ subjectId: "s1", title: "C", titleAr: "فصل", order: 1, isActive: true }).success).toBe(true);
    expect(chapterInputSchema.safeParse({ subjectId: "a b", title: "C", titleAr: "فصل", order: 1, isActive: true }).success).toBe(false);
  });
});

describe("exam configuration", () => {
  const exam = {
    title: "Mechanics quiz",
    titleAr: "اختبار الميكانيكا",
    subjectId: "s1",
    academicYear: "2026",
    durationSeconds: 1800,
    shuffleQuestions: true,
    shuffleOptions: false,
    showScoreAfterSubmit: true,
    showCorrectAnswersAfterSubmit: false,
    showExplanationsAfterSubmit: false,
  };

  it("accepts a valid configuration", () => {
    expect(examConfigSchema.safeParse(exam).success).toBe(true);
  });

  it("rejects durations below one minute and above six hours", () => {
    expect(examConfigSchema.safeParse({ ...exam, durationSeconds: 59 }).success).toBe(false);
    expect(examConfigSchema.safeParse({ ...exam, durationSeconds: 21601 }).success).toBe(false);
  });

  it("default review policy hides answers and explanations until configured", () => {
    expect(DEFAULT_REVIEW_POLICY).toEqual({
      showScoreAfterSubmit: true,
      showCorrectAnswersAfterSubmit: false,
      showExplanationsAfterSubmit: false,
    });
  });
});
