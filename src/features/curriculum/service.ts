import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { auditLogWrite } from "@/lib/audit/log";
import { DomainError } from "@/lib/server/errors";
import type { ChapterInput, LessonInput, SubjectInput } from "@/lib/validation/curriculum";
import { COLLECTIONS } from "@/types/firestore";

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

export async function listSubjects(db: Firestore): Promise<SubjectDto[]> {
  const snap = await db.collection(COLLECTIONS.subjects).get();
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
        applicableTracks: d.applicableTracks ?? [],
        order: d.order,
        isActive: d.isActive,
      } satisfies SubjectDto;
    })
    .sort(byOrder);
}

export async function getSubject(db: Firestore, subjectId: string): Promise<SubjectDto | null> {
  return (await listSubjects(db)).find((subject) => subject.id === subjectId) ?? null;
}

export async function listChapters(db: Firestore, subjectId?: string): Promise<ChapterDto[]> {
  const query = subjectId
    ? db.collection(COLLECTIONS.chapters).where("subjectId", "==", subjectId)
    : db.collection(COLLECTIONS.chapters);
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

export async function listLessons(db: Firestore, chapterId?: string): Promise<LessonDto[]> {
  const query = chapterId
    ? db.collection(COLLECTIONS.lessons).where("chapterId", "==", chapterId)
    : db.collection(COLLECTIONS.lessons);
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

async function assertSlugAvailable(db: Firestore, slug: string, exceptId?: string) {
  const snap = await db.collection(COLLECTIONS.subjects).where("slug", "==", slug).get();
  if (snap.docs.some((doc) => doc.id !== exceptId)) {
    throw new DomainError("المعرّف المختصر مستخدم بالفعل لمادة أخرى.");
  }
}

export async function createSubject(db: Firestore, actorUid: string, input: SubjectInput): Promise<string> {
  await assertSlugAvailable(db, input.slug);
  const ref = db.collection(COLLECTIONS.subjects).doc();
  const audit = auditLogWrite(db, actorUid, {
    action: "SUBJECT_CREATED",
    targetType: "subject",
    targetId: ref.id,
    metadata: { slug: input.slug },
  });
  const batch = db.batch();
  batch.set(ref, {
    ...input,
    createdBy: actorUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return ref.id;
}

export async function updateSubject(db: Firestore, actorUid: string, subjectId: string, input: SubjectInput) {
  const ref = db.collection(COLLECTIONS.subjects).doc(subjectId);
  const existing = await ref.get();
  if (!existing.exists) throw new DomainError("المادة غير موجودة.");
  await assertSlugAvailable(db, input.slug, subjectId);

  const audit = auditLogWrite(db, actorUid, {
    action: "SUBJECT_UPDATED",
    targetType: "subject",
    targetId: subjectId,
    metadata: { isActive: input.isActive },
  });
  const batch = db.batch();
  batch.update(ref, { ...input, updatedAt: FieldValue.serverTimestamp() });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}

async function requireSubject(db: Firestore, subjectId: string) {
  const snap = await db.collection(COLLECTIONS.subjects).doc(subjectId).get();
  if (!snap.exists) throw new DomainError("المادة غير موجودة.");
}

async function requireChapterInSubject(db: Firestore, chapterId: string, subjectId: string) {
  const snap = await db.collection(COLLECTIONS.chapters).doc(chapterId).get();
  if (!snap.exists || snap.data()?.subjectId !== subjectId) {
    throw new DomainError("الفصل غير موجود ضمن هذه المادة.");
  }
}

export async function createChapter(db: Firestore, actorUid: string, input: ChapterInput): Promise<string> {
  await requireSubject(db, input.subjectId);
  const ref = db.collection(COLLECTIONS.chapters).doc();
  const audit = auditLogWrite(db, actorUid, { action: "CHAPTER_CREATED", targetType: "chapter", targetId: ref.id });
  const batch = db.batch();
  batch.set(ref, {
    ...input,
    createdBy: actorUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return ref.id;
}

export async function updateChapter(db: Firestore, actorUid: string, chapterId: string, input: ChapterInput) {
  const ref = db.collection(COLLECTIONS.chapters).doc(chapterId);
  const existing = await ref.get();
  if (!existing.exists) throw new DomainError("الفصل غير موجود.");
  if (existing.data()?.subjectId !== input.subjectId) {
    throw new DomainError("لا يمكن نقل الفصل إلى مادة أخرى.");
  }
  const audit = auditLogWrite(db, actorUid, { action: "CHAPTER_UPDATED", targetType: "chapter", targetId: chapterId });
  const batch = db.batch();
  batch.update(ref, { ...input, updatedAt: FieldValue.serverTimestamp() });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}

export async function createLesson(db: Firestore, actorUid: string, input: LessonInput): Promise<string> {
  await requireChapterInSubject(db, input.chapterId, input.subjectId);
  const ref = db.collection(COLLECTIONS.lessons).doc();
  const audit = auditLogWrite(db, actorUid, { action: "LESSON_CREATED", targetType: "lesson", targetId: ref.id });
  const batch = db.batch();
  batch.set(ref, {
    ...input,
    createdBy: actorUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(audit.ref, audit.data);
  await batch.commit();
  return ref.id;
}

export async function updateLesson(db: Firestore, actorUid: string, lessonId: string, input: LessonInput) {
  const ref = db.collection(COLLECTIONS.lessons).doc(lessonId);
  const existing = await ref.get();
  if (!existing.exists) throw new DomainError("الدرس غير موجود.");
  if (existing.data()?.chapterId !== input.chapterId || existing.data()?.subjectId !== input.subjectId) {
    throw new DomainError("لا يمكن نقل الدرس إلى فصل آخر.");
  }
  const audit = auditLogWrite(db, actorUid, { action: "LESSON_UPDATED", targetType: "lesson", targetId: lessonId });
  const batch = db.batch();
  batch.update(ref, { ...input, updatedAt: FieldValue.serverTimestamp() });
  batch.set(audit.ref, audit.data);
  await batch.commit();
}
