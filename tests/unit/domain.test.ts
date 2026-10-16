import { describe, expect, it } from "vitest";
import { attemptIdFor, examQuestionIdFor, resultIdFor } from "@/lib/domain/ids";
import {
  canTransitionAttempt,
  canTransitionExam,
  decideAnswerSave,
  decideStart,
  isDeadlinePassed,
} from "@/lib/domain/state";

describe("deterministic IDs", () => {
  it("one attempt ID per student per exam, stable across calls", () => {
    expect(attemptIdFor("e1", "s1")).toBe("e1__s1");
    expect(attemptIdFor("e1", "s1")).toBe(attemptIdFor("e1", "s1"));
    expect(attemptIdFor("e1", "s2")).not.toBe(attemptIdFor("e1", "s1"));
  });

  it("result ID equals attempt ID so retries converge", () => {
    expect(resultIdFor("e1__s1")).toBe("e1__s1");
  });

  it("rejects IDs that could escape a path segment", () => {
    expect(() => attemptIdFor("../e1", "s1")).toThrow();
    expect(() => attemptIdFor("e1", "s/1")).toThrow();
    expect(() => examQuestionIdFor("")).toThrow();
    expect(() => examQuestionIdFor("q".repeat(129))).toThrow();
  });
});

describe("exam state machine", () => {
  it("allows only DRAFT -> PUBLISHED -> CLOSED", () => {
    expect(canTransitionExam("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransitionExam("PUBLISHED", "CLOSED")).toBe(true);
    expect(canTransitionExam("DRAFT", "CLOSED")).toBe(false);
    expect(canTransitionExam("PUBLISHED", "DRAFT")).toBe(false);
  });

  it("CLOSED is terminal", () => {
    expect(canTransitionExam("CLOSED", "PUBLISHED")).toBe(false);
    expect(canTransitionExam("CLOSED", "DRAFT")).toBe(false);
  });
});

describe("attempt state machine", () => {
  it("allows IN_PROGRESS -> SUBMITTED -> GRADED only", () => {
    expect(canTransitionAttempt("IN_PROGRESS", "SUBMITTED")).toBe(true);
    expect(canTransitionAttempt("SUBMITTED", "GRADED")).toBe(true);
    expect(canTransitionAttempt("IN_PROGRESS", "GRADED")).toBe(false);
  });

  it("a submitted attempt never returns to IN_PROGRESS", () => {
    expect(canTransitionAttempt("SUBMITTED", "IN_PROGRESS")).toBe(false);
    expect(canTransitionAttempt("GRADED", "IN_PROGRESS")).toBe(false);
    expect(canTransitionAttempt("GRADED", "SUBMITTED")).toBe(false);
  });
});

describe("deadline handling", () => {
  const deadline = 1_000_000;

  it("is open before the deadline", () => {
    expect(isDeadlinePassed(deadline, deadline - 1)).toBe(false);
  });

  it("counts the deadline instant itself as expired", () => {
    expect(isDeadlinePassed(deadline, deadline)).toBe(true);
  });

  it("answer saves are refused after the deadline even while IN_PROGRESS", () => {
    expect(decideAnswerSave({ status: "IN_PROGRESS", deadlineMs: deadline }, deadline + 1)).toEqual({
      allowed: false,
      reason: "DEADLINE_PASSED",
    });
  });

  it("answer saves are refused once submitted, regardless of time", () => {
    expect(decideAnswerSave({ status: "SUBMITTED", deadlineMs: deadline }, 0)).toEqual({
      allowed: false,
      reason: "NOT_IN_PROGRESS",
    });
  });

  it("answer saves are accepted for an active attempt before the deadline", () => {
    expect(decideAnswerSave({ status: "IN_PROGRESS", deadlineMs: deadline }, deadline - 5)).toEqual({ allowed: true });
  });
});

describe("start decision", () => {
  it("only published, non-archived exams can start", () => {
    expect(decideStart({ status: "PUBLISHED", archived: false })).toEqual({ allowed: true });
    expect(decideStart({ status: "DRAFT", archived: false })).toEqual({ allowed: false, reason: "EXAM_NOT_PUBLISHED" });
    expect(decideStart({ status: "CLOSED", archived: false })).toEqual({ allowed: false, reason: "EXAM_NOT_PUBLISHED" });
    expect(decideStart({ status: "PUBLISHED", archived: true })).toEqual({ allowed: false, reason: "EXAM_ARCHIVED" });
  });
});
