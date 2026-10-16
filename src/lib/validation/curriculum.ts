import { z } from "zod";

/** Shared text rules. Limits protect Firestore documents and the UI. */
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default("");
const id = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, { error: "معرّف غير صالح." });
const order = z.number().int().min(0).max(10_000);

export const subjectInputSchema = z.object({
  name: text(120),
  nameAr: text(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "المعرّف المختصر يحتوي أحرفًا لاتينية صغيرة وأرقامًا وشرطات فقط." })
    .max(80),
  description: optionalText(1000),
  academicYear: text(40),
  curriculum: text(80),
  applicableTracks: z.array(text(60)).max(20),
  order,
  isActive: z.boolean(),
});
export type SubjectInput = z.infer<typeof subjectInputSchema>;

export const chapterInputSchema = z.object({
  subjectId: id,
  title: text(160),
  titleAr: text(160),
  description: optionalText(1000),
  order,
  isActive: z.boolean(),
});
export type ChapterInput = z.infer<typeof chapterInputSchema>;

export const lessonInputSchema = z.object({
  subjectId: id,
  chapterId: id,
  title: text(160),
  titleAr: text(160),
  order,
  isActive: z.boolean(),
});
export type LessonInput = z.infer<typeof lessonInputSchema>;
