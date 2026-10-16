"use server";

import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { runAdminAction } from "@/lib/server/action";
import { examConfigSchema } from "@/lib/validation/exams";
import * as service from "./service";

const db = () => getAdminDb();

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, { error: "معرّف غير صالح." });
const pointsSchema = z.number().int().min(1, { error: "الدرجة يجب أن تكون 1 على الأقل." }).max(100, { error: "الدرجة لا تتجاوز 100." });

export async function createExamAction(input: unknown) {
  return runAdminAction(async (actor) => ({
    id: await service.createDraftExam(db(), actor, examConfigSchema.parse(input)),
  }));
}

export async function updateExamAction(examId: string, input: unknown) {
  return runAdminAction(async (actor) => {
    await service.updateDraftExam(db(), actor, idSchema.parse(examId), examConfigSchema.parse(input));
    return { id: examId };
  });
}

export async function addExamQuestionAction(examId: string, questionId: string, points: number) {
  return runAdminAction(async (actor) => {
    await service.addQuestionToExam(db(), actor, idSchema.parse(examId), idSchema.parse(questionId), pointsSchema.parse(points));
    return { id: examId };
  });
}

export async function removeExamQuestionAction(examId: string, questionId: string) {
  return runAdminAction(async (actor) => {
    await service.removeQuestionFromExam(db(), actor, idSchema.parse(examId), idSchema.parse(questionId));
    return { id: examId };
  });
}

export async function moveExamQuestionAction(examId: string, questionId: string, direction: "up" | "down") {
  return runAdminAction(async () => {
    await service.moveQuestionInExam(db(), idSchema.parse(examId), idSchema.parse(questionId), z.enum(["up", "down"]).parse(direction));
    return { id: examId };
  });
}

export async function setExamQuestionPointsAction(examId: string, questionId: string, points: number) {
  return runAdminAction(async () => {
    await service.setQuestionPoints(db(), idSchema.parse(examId), idSchema.parse(questionId), pointsSchema.parse(points));
    return { id: examId };
  });
}

export async function publishExamAction(examId: string) {
  return runAdminAction(async (actor) => {
    await service.publishExam(db(), actor, idSchema.parse(examId));
    return { id: examId };
  });
}

export async function closeExamAction(examId: string) {
  return runAdminAction(async (actor) => {
    await service.closeExam(db(), actor, idSchema.parse(examId));
    return { id: examId };
  });
}

export async function archiveExamAction(examId: string) {
  return runAdminAction(async (actor) => {
    await service.archiveExam(db(), actor, idSchema.parse(examId));
    return { id: examId };
  });
}
