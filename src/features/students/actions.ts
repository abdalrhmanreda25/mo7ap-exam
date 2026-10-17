"use server";

import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { runAdminAction } from "@/lib/server/action";
import * as service from "./service";

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
