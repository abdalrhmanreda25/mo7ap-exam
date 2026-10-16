"use server";

import { getAdminDb } from "@/lib/firebase/admin";
import { runAdminAction } from "@/lib/server/action";
import { chapterInputSchema, lessonInputSchema, subjectInputSchema } from "@/lib/validation/curriculum";
import * as service from "./service";

const db = () => getAdminDb();

export async function createSubjectAction(input: unknown) {
  return runAdminAction(async (actor) => ({
    id: await service.createSubject(db(), actor, subjectInputSchema.parse(input)),
  }));
}

export async function updateSubjectAction(subjectId: string, input: unknown) {
  return runAdminAction(async (actor) => {
    await service.updateSubject(db(), actor, subjectId, subjectInputSchema.parse(input));
    return { id: subjectId };
  });
}

export async function createChapterAction(input: unknown) {
  return runAdminAction(async (actor) => ({
    id: await service.createChapter(db(), actor, chapterInputSchema.parse(input)),
  }));
}

export async function updateChapterAction(chapterId: string, input: unknown) {
  return runAdminAction(async (actor) => {
    await service.updateChapter(db(), actor, chapterId, chapterInputSchema.parse(input));
    return { id: chapterId };
  });
}

export async function createLessonAction(input: unknown) {
  return runAdminAction(async (actor) => ({
    id: await service.createLesson(db(), actor, lessonInputSchema.parse(input)),
  }));
}

export async function updateLessonAction(lessonId: string, input: unknown) {
  return runAdminAction(async (actor) => {
    await service.updateLesson(db(), actor, lessonId, lessonInputSchema.parse(input));
    return { id: lessonId };
  });
}
