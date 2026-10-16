"use server";

import { getAdminDb } from "@/lib/firebase/admin";
import { runAdminAction } from "@/lib/server/action";
import { questionInputSchema } from "@/lib/validation/questions";
import * as service from "./service";

const db = () => getAdminDb();

export async function createQuestionAction(input: unknown) {
  return runAdminAction(async (actor) => ({
    id: await service.createQuestion(db(), actor, questionInputSchema.parse(input)),
  }));
}

export async function updateQuestionAction(questionId: string, input: unknown) {
  return runAdminAction(async (actor) => {
    await service.updateQuestion(db(), actor, questionId, questionInputSchema.parse(input));
    return { id: questionId };
  });
}
