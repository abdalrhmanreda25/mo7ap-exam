"use server";

import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { runAdminAction } from "@/lib/server/action";
import * as service from "./service";
import { GRADE_IDS } from "@/lib/grades";

const db = () => getAdminDb();
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/, { error: "معرّف غير صالح." });
const reasonSchema = z.string().trim().min(3, { error: "اكتب سببًا من 3 أحرف على الأقل." }).max(500);

export async function reopenAttemptAction(attemptId: string, reason: string) {
  return runAdminAction(async (actor) => ({
    archivedAs: await service.reopenAttempt(db(), actor, idSchema.parse(attemptId), reasonSchema.parse(reason)),
  }));
}

export async function reopenExamForAllAction(examId: string, reason: string) {
  return runAdminAction(async (actor) => service.reopenExamForAll(db(), actor, idSchema.parse(examId), reasonSchema.parse(reason)));
}

export async function setStudentActiveAction(uid: string, active: boolean) {
  return runAdminAction(async (actor) => {
    await service.setStudentActive(db(), actor, idSchema.parse(uid), z.boolean().parse(active));
    return { uid, active };
  });
}

const updateSchema = z.object({
  displayName: z.string().trim().min(1, { error: "الاسم مطلوب." }).max(120),
  email: z.string().trim().pipe(z.email({ error: "بريد غير صالح." })),
  password: z.string().max(128).optional().refine((v) => !v || v.length >= 6, { error: "كلمة المرور 6 أحرف على الأقل." }),
  grade: z.enum(GRADE_IDS, { error: "اختر الصف." }),
});

const createSchema = updateSchema.extend({
  password: z.string().min(6, { error: "كلمة المرور 6 أحرف على الأقل." }).max(128),
});

export async function createStudentAction(input: unknown) {
  return runAdminAction(async (actor) => ({ uid: await service.createStudent(db(), actor, createSchema.parse(input)) }));
}

export async function updateStudentAction(uid: string, input: unknown) {
  return runAdminAction(async (actor) => {
    const parsed = updateSchema.parse(input);
    await service.updateStudent(db(), actor, idSchema.parse(uid), { ...parsed, password: parsed.password || undefined });
    return { uid };
  });
}

export async function deleteStudentAction(uid: string) {
  return runAdminAction(async (actor) => {
    await service.deleteStudent(db(), actor, idSchema.parse(uid));
    return { uid };
  });
}

export async function studentPasswordLinkAction(uid: string) {
  return runAdminAction(async (actor) => ({ link: await service.studentPasswordLink(db(), actor.workspaceId, idSchema.parse(uid)) }));
}
