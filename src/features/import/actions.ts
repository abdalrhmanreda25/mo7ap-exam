"use server";

import { getAdminDb } from "@/lib/firebase/admin";
import { runAdminAction } from "@/lib/server/action";
import { DomainError } from "@/lib/server/errors";
import { COLLECTIONS } from "@/types/firestore";
import { createChapter, createLesson, createSubject, listChapters, listLessons, listSubjects } from "@/features/curriculum/service";
import { createQuestion } from "@/features/questions/service";
import { addQuestionToExam, getExam } from "@/features/exams/service";
import { parseImportFile, type ImportRow } from "./parse";
import { mapChapters, mapExamQuestions, mapLessons, mapQuestions, mapSubjects, type RowOutcome } from "./mappers";

export type ImportKind = "subjects" | "chapters" | "lessons" | "questions" | "examQuestions";
const KINDS: ImportKind[] = ["subjects", "chapters", "lessons", "questions", "examQuestions"];

export interface ImportPreview {
  kind: ImportKind;
  total: number;
  valid: number;
  errors: string[];
}

interface Analysis {
  rows: number;
  valid: { line: number; value: unknown; write: (db: FirebaseFirestore.Firestore, actor: string) => Promise<unknown> }[];
  errors: string[];
}

function fail(outcomes: RowOutcome<unknown>[]) {
  return outcomes.flatMap((o) => (o.ok ? [] : [`سطر ${o.line}: ${o.message}`]));
}

/** Parse, resolve references, validate every row. Writes nothing. */
async function analyze(kind: ImportKind, formData: FormData): Promise<Analysis> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new DomainError("اختر ملفًا أولًا.");
  if (!KINDS.includes(kind)) throw new DomainError("نوع الاستيراد غير معروف.");
  const rows: ImportRow[] = await parseImportFile(file);
  const db = getAdminDb();

  if (kind === "subjects") {
    const existing = new Set((await listSubjects(db)).map((s) => s.slug));
    const outcomes = mapSubjects(rows);
    const seen = new Set<string>();
    const errors = fail(outcomes);
    const valid: Analysis["valid"] = [];
    for (const o of outcomes) {
      if (!o.ok) continue;
      const slug = o.value.slug;
      if (existing.has(slug)) errors.push(`سطر ${o.line}: المعرّف "${slug}" مستخدم بالفعل.`);
      else if (seen.has(slug)) errors.push(`سطر ${o.line}: المعرّف "${slug}" مكرر داخل الملف.`);
      else {
        seen.add(slug);
        valid.push({ line: o.line, value: o.value, write: (d, actor) => createSubject(d, actor, o.value) });
      }
    }
    return { rows: rows.length, valid, errors };
  }

  if (kind === "chapters") {
    const subjects = await listSubjects(db);
    const idBySlug = new Map(subjects.map((s) => [s.slug, s.id]));
    const outcomes = mapChapters(rows, idBySlug);
    return bundle(rows.length, outcomes, (value) => (d, actor) => createChapter(d, actor, value));
  }

  if (kind === "lessons") {
    const subjects = await listSubjects(db);
    const slugById = new Map(subjects.map((s) => [s.id, s.slug]));
    const chapters = await listChapters(db);
    const chapterByKey = new Map(
      chapters.map((c) => [`${slugById.get(c.subjectId)}|${c.titleAr}`, { id: c.id, subjectId: c.subjectId }]),
    );
    const outcomes = mapLessons(rows, chapterByKey);
    return bundle(rows.length, outcomes, (value) => (d, actor) => createLesson(d, actor, value));
  }

  if (kind === "questions") {
    const subjects = await listSubjects(db);
    const slugById = new Map(subjects.map((s) => [s.id, s.slug]));
    const chapters = await listChapters(db);
    const lessons = await listLessons(db);
    const chapterById = new Map(chapters.map((c) => [c.id, c]));
    const subjectIdBySlug = new Map(subjects.map((s) => [s.slug, s.id]));
    const chapterByKey = new Map(chapters.map((c) => [`${slugById.get(c.subjectId)}|${c.titleAr}`, { id: c.id, subjectId: c.subjectId }]));
    const lessonByKey = new Map(
      lessons.map((l) => {
        const chapter = chapterById.get(l.chapterId);
        return [`${slugById.get(l.subjectId)}|${chapter?.titleAr}|${l.titleAr}`, { id: l.id, chapterId: l.chapterId, subjectId: l.subjectId }];
      }),
    );
    const outcomes = mapQuestions(rows, { subjectIdBySlug, chapterByKey, lessonByKey });
    return bundle(rows.length, outcomes, (value) => (d, actor) => createQuestion(d, actor, value));
  }

  // examQuestions: needs examId and the exam's subject
  const examId = String(formData.get("examId") ?? "");
  const exam = examId ? await getExam(db, examId) : null;
  if (!exam) throw new DomainError("الامتحان غير موجود.");
  if (exam.status !== "DRAFT") throw new DomainError("لا يمكن تعديل امتحان منشور.");

  const bankSnap = await db
    .collection(COLLECTIONS.questions)
    .where("subjectId", "==", exam.subjectId)
    .where("status", "==", "READY")
    .get();
  const bankByStatement = new Map<string, { id: string } | "AMBIGUOUS">();
  for (const doc of bankSnap.docs) {
    const text = String(doc.data().statementAr ?? "").trim();
    if (!text) continue;
    bankByStatement.set(text, bankByStatement.has(text) ? "AMBIGUOUS" : { id: doc.id });
  }
  const outcomes = mapExamQuestions(rows, bankByStatement);
  return bundle(rows.length, outcomes, (value) => (d, actor) =>
    addQuestionToExam(d, actor, examId, value.questionId, value.points),
  );
}

function bundle<T>(
  count: number,
  outcomes: RowOutcome<T>[],
  writer: (value: T) => (db: FirebaseFirestore.Firestore, actor: string) => Promise<unknown>,
): Analysis {
  const valid = outcomes.flatMap((o) => (o.ok ? [{ line: o.line, value: o.value, write: writer(o.value) }] : []));
  return { rows: count, valid, errors: fail(outcomes) };
}

export async function previewImportAction(kind: ImportKind, formData: FormData) {
  return runAdminAction(async (): Promise<ImportPreview> => {
    const analysis = await analyze(kind, formData);
    return { kind, total: analysis.rows, valid: analysis.valid.length, errors: analysis.errors.slice(0, 100) };
  });
}

/**
 * All-or-nothing validation, then sequential writes through the normal services.
 * A database failure mid-way is reported with how many rows were written.
 */
export async function commitImportAction(kind: ImportKind, formData: FormData) {
  return runAdminAction(async (actor) => {
    const analysis = await analyze(kind, formData);
    if (analysis.errors.length > 0) {
      throw new DomainError("توجد أخطاء في الملف، لم يُستورد شيء. صحّحها ثم أعد الرفع.", analysis.errors.slice(0, 20));
    }
    const db = getAdminDb();
    let written = 0;
    const failures: string[] = [];
    for (const row of analysis.valid) {
      try {
        await row.write(db, actor);
        written++;
      } catch (error) {
        failures.push(`سطر ${row.line}: ${error instanceof Error ? error.message : "فشل الحفظ."}`);
      }
    }
    if (failures.length > 0) {
      throw new DomainError(`تم حفظ ${written} من ${analysis.valid.length} صفًا. فشل الباقي:`, failures.slice(0, 20));
    }
    return { written };
  });
}
