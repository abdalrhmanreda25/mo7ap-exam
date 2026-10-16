import type { AttemptStatus, ExamStatus } from "@/types/firestore";

/**
 * Pure state rules. Server code (Phase 4) calls these inside transactions.
 * Keeping them pure makes every transition unit-testable without Firestore.
 */

const EXAM_TRANSITIONS: Record<ExamStatus, readonly ExamStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["CLOSED"],
  CLOSED: [],
};

export function canTransitionExam(from: ExamStatus, to: ExamStatus): boolean {
  return EXAM_TRANSITIONS[from].includes(to);
}

/**
 * IN_PROGRESS -> SUBMITTED covers student submit, early submit, and deadline expiry.
 * SUBMITTED -> GRADED is the grading step. Phase 4 grades objective questions
 * in the same transaction as submit, but the states stay separate.
 * GRADED is terminal. Nothing moves an attempt back to IN_PROGRESS.
 */
const ATTEMPT_TRANSITIONS: Record<AttemptStatus, readonly AttemptStatus[]> = {
  IN_PROGRESS: ["SUBMITTED"],
  SUBMITTED: ["GRADED"],
  GRADED: [],
};

export function canTransitionAttempt(from: AttemptStatus, to: AttemptStatus): boolean {
  return ATTEMPT_TRANSITIONS[from].includes(to);
}

/**
 * The server deadline is authoritative. The deadline instant itself counts as expired.
 * Times are epoch milliseconds from the server clock.
 */
export function isDeadlinePassed(deadlineMs: number, nowMs: number): boolean {
  return nowMs >= deadlineMs;
}

export type StartDecision =
  | { allowed: true }
  | { allowed: false; reason: "EXAM_NOT_PUBLISHED" | "EXAM_ARCHIVED" };

export function decideStart(exam: { status: ExamStatus; archived: boolean }): StartDecision {
  if (exam.status !== "PUBLISHED") return { allowed: false, reason: "EXAM_NOT_PUBLISHED" };
  if (exam.archived) return { allowed: false, reason: "EXAM_ARCHIVED" };
  return { allowed: true };
}

export type AnswerDecision =
  | { allowed: true }
  | { allowed: false; reason: "NOT_IN_PROGRESS" | "DEADLINE_PASSED" };

/** Answers are accepted only while the attempt is active and the server clock is before the deadline. */
export function decideAnswerSave(
  attempt: { status: AttemptStatus; deadlineMs: number },
  nowMs: number,
): AnswerDecision {
  if (attempt.status !== "IN_PROGRESS") return { allowed: false, reason: "NOT_IN_PROGRESS" };
  if (isDeadlinePassed(attempt.deadlineMs, nowMs)) return { allowed: false, reason: "DEADLINE_PASSED" };
  return { allowed: true };
}
