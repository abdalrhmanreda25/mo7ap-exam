/**
 * Deterministic document IDs. These enforce uniqueness in Firestore itself:
 * a second create with the same ID fails inside a transaction, so duplicate
 * attempts and duplicate results cannot exist, whatever the client sends.
 */

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function assertSafeId(value: string, label = "id"): string {
  if (!SAFE_ID.test(value)) {
    throw new Error(`Invalid ${label}: must match ${SAFE_ID.source}`);
  }
  return value;
}

/** One attempt per student per exam. The ID is the uniqueness constraint. */
export function attemptIdFor(examId: string, studentId: string): string {
  assertSafeId(examId, "examId");
  assertSafeId(studentId, "studentId");
  return `${examId}__${studentId}`;
}

/** One result per attempt, so retried submissions converge on the same document. */
export function resultIdFor(attemptId: string): string {
  assertSafeId(attemptId, "attemptId");
  return attemptId;
}

/** A question appears at most once per exam, so its bank ID doubles as the exam-question ID. */
export function examQuestionIdFor(questionId: string): string {
  assertSafeId(questionId, "questionId");
  return questionId;
}
