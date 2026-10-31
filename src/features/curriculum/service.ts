import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { auditLogWrite } from "@/lib/audit/log";
import { DomainError } from "@/lib/server/errors";
import type { ChapterInput, LessonInput, SubjectInput, SubjectInputArg } from "@/lib/validation/curriculum";
import { gradeOf } from "@/lib/grades";
import { COLLECTIONS } from "@/types/firestore";
import { assertInWorkspace, inWorkspace, type Actor } from "@/lib/workspace";

export interface SubjectDto extends SubjectInput {
  id: string;
}
export interface ChapterDto extends ChapterInput {
  id: string;
}
export interface LessonDto extends LessonInput {
  id: string;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export async function listSubjects(db: Firestore, workspaceId: string): Promise<SubjectDto[]> {
  const snap = await db.collection(COLLECTIONS.subjects).where("workspaceId", "==", workspaceId).get();
  return snap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name,
        nameAr: d.nameAr,
        slug: d.slug,
        description: d.description ?? "",
        academicYear: d.academicYear,
        curriculum: d.curriculum,
        grade: gradeOf(d.grade),
        applicableTracks: d.applicableTracks ?? [],
        order: d.order,
        isActive: d.isActive,
      } satisfies SubjectDto;
    })
    .sort(byOrder);
}

export async function getSubject(db: Firestore, workspaceId: string, subjectId: string): Promise<SubjectDto | null> {
  return (await listSubjects(db, workspaceId)).find((subject) => subject.id === subjectId) ?? null;
}

export async function listChapters(db: Firestore, workspaceId: string, subjectId?: string): Promise<ChapterDto[]> {
  const scoped = db.collection(COLLECTIONS.chapters).where("workspaceId", "==", workspaceId);
  const query = subjectId ? scoped.where("subjectId", "==", subjectId) : scoped;
  const snap = await query.get();
  return snap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        subjectId: d.subjectId,
        title: d.title ?? "",
        titleAr: d.titleAr,
        description: d.description ?? "",
        order: d.order,
        isActive: d.isActive,
      } satisfies ChapterDto;
    })
    .sort(byOrder);
}

export async function listLessons(db: Firestore, workspaceId: string, chapterId?: string): Promise<LessonDto[]> {
  const scoped = db.collection(COLLECTIONS.lessons).where("workspaceId", "==", workspaceId);
  const query = chapterId ? scoped.where("chapterId", "==", chapterId) : scoped;
  const snap = await query.get();
  return snap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        subjectId: d.subjectId,
        chapterId: d.chapterId,
        title: d.title ?? "",
        titleAr: d.titleAr,
        order: d.order,
        isActive: d.isActive,
      } satisfies LessonDto;
    })
    .sort(byOrder);
}

/** Subject codes are unique within one teacher's space. */
async function assertSlugAvailable(db: Firestore, workspaceId: string, slug: string, exceptId?: string) {
  const snap = await db.collection(COLLECTIONS.subjects).where("workspaceId", "==", workspaceId).where("slug", "==", slug).get();
  if (snap.docs.some((doc) => doc.id !== exceptId)) {
    throw new DomainError("المعرّف المختصر مستخدم بالفعل لمادة أخرى.");
  }
}

export async function createSubject(db: Firestore, actor: Actor, input: SubjectInputArg): Promise<string> {
  await assertSlugAvailable(db, actor.workspaceId, input.slug);
  const ref = db.collection(COLLECTIONS.subjects).doc();
  const audit = auditLogWrite(db, actor, {
    action: "SUBJECT_CREATED",
    targetType: "subject",
    targetId: ref.id,
    metadata: { slug: input.slug },
  });
  const batch = db.batch();
  batch.set(ref, {
    ...input,
    grade: gradeOf(input.grade),
    workspaceId: actor.workspaceId,
    createdBy: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return ref.id;
}

export async function updateSubject(db: Firestore, actor: Actor, subjectId: string, input: SubjectInputArg) {
  const ref = db.collection(COLLECTIONS.subjects).doc(subjectId);
  assertInWorkspace((await ref.get()).data(), actor.workspaceId, "المادة غير موجودة.");
  await assertSlugAvailable(db, actor.workspaceId, input.slug, subjectId);

  const audit = auditLogWrite(db, actor, {
    action: "SUBJECT_UPDATED",
    targetType: "subject",
    targetId: subjectId,
    metadata: { isActive: input.isActive },
  });
  const batch = db.batch();
  batch.update(ref, { ...input, grade: gradeOf(input.grade), updatedAt: FieldValue.serverTimestamp() });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}

/** A subject of this space. Exported so other features can check a subject before using it. */
export async function requireSubject(db: Firestore, workspaceId: string, subjectId: string) {
  assertInWorkspace((await db.collection(COLLECTIONS.subjects).doc(subjectId).get()).data(), workspaceId, "المادة غير موجودة.");
}

async function requireChapterInSubject(db: Firestore, workspaceId: string, chapterId: string, subjectId: string) {
  const data = (await db.collection(COLLECTIONS.chapters).doc(chapterId).get()).data();
  if (!inWorkspace(data, workspaceId) || data?.subjectId !== subjectId) {
    throw new DomainError("الفصل غير موجود ضمن هذه المادة.");
  }
}

export async function createChapter(db: Firestore, actor: Actor, input: ChapterInput): Promise<string> {
  await requireSubject(db, actor.workspaceId, input.subjectId);
  const ref = db.collection(COLLECTIONS.chapters).doc();
  const audit = auditLogWrite(db, actor, { action: "CHAPTER_CREATED", targetType: "chapter", targetId: ref.id });
  const batch = db.batch();
  batch.set(ref, {
    ...input,
    workspaceId: actor.workspaceId,
    createdBy: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return ref.id;
}

export async function updateChapter(db: Firestore, actor: Actor, chapterId: string, input: ChapterInput) {
  const ref = db.collection(COLLECTIONS.chapters).doc(chapterId);
  const existing = (await ref.get()).data();
  assertInWorkspace(existing, actor.workspaceId, "الفصل غير موجود.");
  if (existing.subjectId !== input.subjectId) {
    throw new DomainError("لا يمكن نقل الفصل إلى مادة أخرى.");
  }
  const audit = auditLogWrite(db, actor, { action: "CHAPTER_UPDATED", targetType: "chapter", targetId: chapterId });
  const batch = db.batch();
  batch.update(ref, { ...input, updatedAt: FieldValue.serverTimestamp() });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}

export async function createLesson(db: Firestore, actor: Actor, input: LessonInput): Promise<string> {
  await requireChapterInSubject(db, actor.workspaceId, input.chapterId, input.subjectId);
  const ref = db.collection(COLLECTIONS.lessons).doc();
  const audit = auditLogWrite(db, actor, { action: "LESSON_CREATED", targetType: "lesson", targetId: ref.id });
  const batch = db.batch();
  batch.set(ref, {
    ...input,
    workspaceId: actor.workspaceId,
    createdBy: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return ref.id;
}

export async function updateLesson(db: Firestore, actor: Actor, lessonId: string, input: LessonInput) {
  const ref = db.collection(COLLECTIONS.lessons).doc(lessonId);
  const existing = (await ref.get()).data();
  assertInWorkspace(existing, actor.workspaceId, "الدرس غير موجود.");
  if (existing.chapterId !== input.chapterId || existing.subjectId !== input.subjectId) {
    throw new DomainError("لا يمكن نقل الدرس إلى فصل آخر.");
  }
  const audit = auditLogWrite(db, actor, { action: "LESSON_UPDATED", targetType: "lesson", targetId: lessonId });
  const batch = db.batch();
  batch.update(ref, { ...input, updatedAt: FieldValue.serverTimestamp() });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}
