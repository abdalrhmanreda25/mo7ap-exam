"use server";

import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { runStudentAction } from "@/lib/server/action";
import { DomainError } from "@/lib/server/errors";
import * as service from "./service";

const db = () => getAdminDb();
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, { error: "معرّف غير صالح." });
const seqSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export async function startExamAction(examId: string) {
  return runStudentAction(async (studentId) => ({
    attemptId: await service.startExam(db(), studentId, idSchema.parse(examId)),
  }));
}

export async function saveAnswerAction(attemptId: string, examQuestionId: string, selectedOptionId: string, seq: number) {
  return runStudentAction(async (studentId) => {
    const result = await service.saveAnswer(
      db(),
      studentId,
      idSchema.parse(attemptId),
      idSchema.parse(examQuestionId),
      idSchema.parse(selectedOptionId),
      seqSchema.parse(seq),
    );
    if (!result.saved) {
      throw new DomainError(
        result.reason === "DEADLINE_PASSED" ? "انتهى وقت الامتحان. لم يُحفظ هذا الاختيار." : "المحاولة منتهية، لا يمكن تغيير الإجابات.",
      );
    }
    return { saved: true };
  });
}

export async function submitAttemptAction(attemptId: string) {
  return runStudentAction(async (studentId) => {
    await service.submitAttempt(db(), studentId, idSchema.parse(attemptId));
    return { attemptId };
  });
}
