import { z } from "zod";
import { QUESTION_DIFFICULTIES, QUESTION_STATUSES, QUESTION_TYPES } from "@/types/firestore";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, { error: "معرّف غير صالح." });
const longText = (max: number) => z.string().trim().max(max);

export const questionOptionInputSchema = z.object({
  id,
  text: z.string().trim().min(1).max(500),
  textAr: z.string().trim().max(500).default(""),
  order: z.number().int().min(0).max(10),
});

export const questionInputSchema = z
  .object({
    subjectId: id,
    chapterId: id,
    lessonId: id,
    type: z.enum(QUESTION_TYPES),
    statement: z.string().trim().min(1).max(4000),
    statementAr: longText(4000),
    mediaReferences: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
    difficulty: z.enum(QUESTION_DIFFICULTIES),
    explanation: longText(4000),
    explanationAr: longText(4000),
    status: z.enum(QUESTION_STATUSES),
    options: z.array(questionOptionInputSchema).min(2).max(6),
    correctOptionId: id,
  })
  .superRefine((question, ctx) => {
    const optionIds = question.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "معرّفات الخيارات يجب أن تكون فريدة." });
    }
    const orders = question.options.map((option) => option.order);
    if (new Set(orders).size !== orders.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "ترتيب الخيارات يجب أن يكون فريدًا." });
    }
    if (!optionIds.includes(question.correctOptionId)) {
      ctx.addIssue({ code: "custom", path: ["correctOptionId"], message: "يجب تحديد إجابة صحيحة من الخيارات." });
    }
    if (question.type === "TRUE_FALSE" && question.options.length !== 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "سؤال صح أو خطأ يحتوي خيارين فقط." });
    }
    if (question.type === "SINGLE_CHOICE" && question.options.length < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "سؤال الاختيار الواحد يحتاج خيارين على الأقل." });
    }
  });
export type QuestionInput = z.infer<typeof questionInputSchema>;
