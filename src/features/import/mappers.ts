import { chapterInputSchema, lessonInputSchema, subjectInputSchema, type ChapterInput, type LessonInput, type SubjectInput } from "@/lib/validation/curriculum";
import { questionInputSchema, type QuestionInput } from "@/lib/validation/questions";
import type { QuestionDifficulty, QuestionStatus, QuestionType } from "@/types/firestore";
import type { ImportRow } from "./parse";

export type RowOutcome<T> = { line: number; ok: true; value: T } | { line: number; ok: false; message: string };

/** Keys are normalized headers. See public/templates/*.csv for the exact column names. */
export const TEMPLATE_HEADERS = {
  subjects: ["name", "nameAr", "slug", "academicYear", "curriculum", "tracks", "order", "isActive", "description"],
  chapters: ["subjectSlug", "titleAr", "title", "order", "isActive"],
  lessons: ["subjectSlug", "chapterTitleAr", "titleAr", "title", "order", "isActive"],
  questions: [
    "subjectSlug", "chapterTitleAr", "lessonTitleAr", "type", "difficulty", "status",
    "statementAr", "statement", "explanationAr", "explanation",
    "option1Ar", "option1", "option2Ar", "option2", "option3Ar", "option3", "option4Ar", "option4",
    "correct", "media",
  ],
  examQuestions: ["questionStatementAr", "points"],
} as const;

const TYPE_ALIASES: Record<string, QuestionType> = {
  single_choice: "SINGLE_CHOICE", single: "SINGLE_CHOICE", "اختيار من متعدد": "SINGLE_CHOICE", "اختيار": "SINGLE_CHOICE",
  true_false: "TRUE_FALSE", truefalse: "TRUE_FALSE", "صح أو خطأ": "TRUE_FALSE", "صح او خطأ": "TRUE_FALSE",
};
const DIFFICULTY_ALIASES: Record<string, QuestionDifficulty> = { easy: "EASY", medium: "MEDIUM", hard: "HARD", "سهل": "EASY", "متوسط": "MEDIUM", "صعب": "HARD" };
const STATUS_ALIASES: Record<string, QuestionStatus> = { draft: "DRAFT", ready: "READY", archived: "ARCHIVED", "مسودة": "DRAFT", "جاهز": "READY", "مؤرشف": "ARCHIVED" };

function bool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const v = value.toLowerCase();
  if (["true", "1", "yes", "نعم", "ظاهر"].includes(v)) return true;
  if (["false", "0", "no", "لا", "مخفي"].includes(v)) return false;
  throw new Error(`قيمة غير مفهومة "${value}"، استخدم نعم أو لا.`);
}

function int(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`القيمة "${value}" ليست رقمًا صحيحًا.`);
  return n;
}

function pick<T extends string>(value: string | undefined, aliases: Record<string, T>, label: string, fallback: T): T {
  if (!value) return fallback;
  const key = value.trim().toLowerCase();
  const found = aliases[key] ?? aliases[value.trim()];
  if (!found) throw new Error(`${label} "${value}" غير معروف.`);
  return found;
}

function run<T>(row: ImportRow, build: () => T): RowOutcome<T> {
  try {
    return { line: row.line, ok: true, value: build() };
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      const zodIssues = (error as unknown as { issues: { message: string }[] }).issues;
      return { line: row.line, ok: false, message: zodIssues.map((i) => i.message).join("، ") };
    }
    return { line: row.line, ok: false, message: error instanceof Error ? error.message : "خطأ غير متوقع." };
  }
}

export function mapSubjects(rows: ImportRow[]): RowOutcome<SubjectInput>[] {
  return rows.map((row, index) =>
    run(row, () => {
      const v = row.values;
      return subjectInputSchema.parse({
        name: v.name || v.namear,
        nameAr: v.namear,
        slug: v.slug,
        description: v.description ?? "",
        academicYear: v.academicyear,
        curriculum: v.curriculum,
        applicableTracks: (v.tracks ?? "").split(/[,،;]/).map((t) => t.trim()).filter(Boolean),
        order: int(v.order, index + 1),
        isActive: bool(v.isactive, true),
      });
    }),
  );
}

export function mapChapters(
  rows: ImportRow[],
  subjectIdBySlug: Map<string, string>,
): RowOutcome<ChapterInput>[] {
  return rows.map((row, index) =>
    run(row, () => {
      const v = row.values;
      const subjectId = subjectIdBySlug.get(v.subjectslug ?? "");
      if (!subjectId) throw new Error(`المادة "${v.subjectslug}" غير موجودة.`);
      return chapterInputSchema.parse({
        subjectId,
        title: v.title || v.titlear,
        titleAr: v.titlear,
        description: "",
        order: int(v.order, index + 1),
        isActive: bool(v.isactive, true),
      });
    }),
  );
}

export function mapLessons(
  rows: ImportRow[],
  chapterByKey: Map<string, { id: string; subjectId: string }>,
): RowOutcome<LessonInput>[] {
  return rows.map((row, index) =>
    run(row, () => {
      const v = row.values;
      const chapter = chapterByKey.get(`${v.subjectslug}|${v.chaptertitlear}`);
      if (!chapter) throw new Error(`الفصل "${v.chaptertitlear}" غير موجود في المادة "${v.subjectslug}".`);
      return lessonInputSchema.parse({
        subjectId: chapter.subjectId,
        chapterId: chapter.id,
        title: v.title || v.titlear,
        titleAr: v.titlear,
        order: int(v.order, index + 1),
        isActive: bool(v.isactive, true),
      });
    }),
  );
}

export function mapQuestions(
  rows: ImportRow[],
  refs: {
    subjectIdBySlug: Map<string, string>;
    chapterByKey: Map<string, { id: string; subjectId: string }>;
    lessonByKey: Map<string, { id: string; chapterId: string; subjectId: string }>;
  },
): RowOutcome<QuestionInput>[] {
  return rows.map((row) =>
    run(row, () => {
      const v = row.values;
      const subjectId = refs.subjectIdBySlug.get(v.subjectslug ?? "");
      if (!subjectId) throw new Error(`المادة "${v.subjectslug}" غير موجودة.`);
      const chapter = refs.chapterByKey.get(`${v.subjectslug}|${v.chaptertitlear}`);
      if (!chapter) throw new Error(`الفصل "${v.chaptertitlear}" غير موجود في المادة.`);
      const lesson = refs.lessonByKey.get(`${v.subjectslug}|${v.chaptertitlear}|${v.lessontitlear}`);
      if (!lesson) throw new Error(`الدرس "${v.lessontitlear}" غير موجود في الفصل.`);

      const options: { id: string; text: string; textAr: string; order: number }[] = [];
      const optionIdByNumber = new Map<number, string>();
      for (let n = 1; n <= 6; n++) {
        const textAr = v[`option${n}ar`] ?? "";
        const text = v[`option${n}`] ?? "";
        if (!textAr && !text) continue;
        const id = `o${n}`;
        optionIdByNumber.set(n, id);
        options.push({ id, text: text || textAr, textAr, order: options.length + 1 });
      }

      const correctNumber = int(v.correct, 0);
      const correctOptionId = optionIdByNumber.get(correctNumber);
      if (!correctOptionId) throw new Error(`العمود "correct" يجب أن يشير إلى خيار موجود (1 إلى ${options.length}).`);

      return questionInputSchema.parse({
        subjectId,
        chapterId: lesson.chapterId,
        lessonId: lesson.id,
        type: pick<QuestionType>(v.type, TYPE_ALIASES, "النوع", "SINGLE_CHOICE"),
        statement: v.statement || v.statementar,
        statementAr: v.statementar ?? "",
        mediaReferences: (v.media ?? "").split(/[;\n]/).map((m) => m.trim()).filter(Boolean),
        difficulty: pick<QuestionDifficulty>(v.difficulty, DIFFICULTY_ALIASES, "الصعوبة", "EASY"),
        explanation: v.explanation ?? "",
        explanationAr: v.explanationar ?? "",
        status: pick<QuestionStatus>(v.status, STATUS_ALIASES, "الحالة", "DRAFT"),
        options,
        correctOptionId,
      });
    }),
  );
}

export function mapExamQuestions(
  rows: ImportRow[],
  bankByStatementAr: Map<string, { id: string } | "AMBIGUOUS">,
): RowOutcome<{ questionId: string; points: number }>[] {
  return rows.map((row) =>
    run(row, () => {
      const v = row.values;
      const match = bankByStatementAr.get((v.questionstatementar ?? "").trim());
      if (!match) throw new Error(`لا يوجد سؤال جاهز بهذا النص في مادة الامتحان.`);
      if (match === "AMBIGUOUS") throw new Error("أكثر من سؤال بنفس النص. عدّل النص في البنك ليكون فريدًا.");
      const points = int(v.points, 1);
      if (points < 1 || points > 100) throw new Error("الدرجة بين 1 و 100.");
      return { questionId: match.id, points };
    }),
  );
}
