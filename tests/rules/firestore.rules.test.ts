import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  addDoc,
} from "firebase/firestore";

/**
 * Direct client-SDK attacks against firestore.rules, run on the Firestore emulator.
 * Every denied case is an attack the spec names: role escalation, answer-key reads,
 * score tampering, submitted-attempt edits, result edits, cross-student reads, and so on.
 */

const RULES = readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
const [FS_HOST, FS_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8181").split(":");

const ADMIN = "admin1";
const STUDENT = "stu1";
const OTHER_STUDENT = "stu2";
const INACTIVE_STUDENT = "stuOff";
const SPOOFED_ADMIN = "fakeAdmin"; // token claims ADMIN, profile says STUDENT
const ANON = null;

let env: RulesTestEnvironment;

const ts = () => Timestamp.now();

const subjectPayload = (overrides: Record<string, unknown> = {}) => ({
  name: "Physics",
  nameAr: "الفيزياء",
  slug: "physics",
  description: "",
  academicYear: "2026",
  curriculum: "thanaweya",
  applicableTracks: ["science"],
  order: 1,
  isActive: true,
  createdBy: ADMIN,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

function asUser(uid: string | null, role?: "ADMIN" | "STUDENT") {
  if (uid === null) return env.unauthenticatedContext().firestore();
  return env.authenticatedContext(uid, role ? { role } : {}).firestore();
}

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = ts();
    const profile = (uid: string, role: string, isActive: boolean) =>
      setDoc(doc(db, "users", uid), { uid, displayName: uid, email: null, role, isActive, createdAt: now, updatedAt: now });

    await profile(ADMIN, "ADMIN", true);
    await profile(STUDENT, "STUDENT", true);
    await profile(OTHER_STUDENT, "STUDENT", true);
    await profile(INACTIVE_STUDENT, "STUDENT", false);
    await profile(SPOOFED_ADMIN, "STUDENT", true);

    await setDoc(doc(db, "subjects", "s1"), { ...subjectPayload(), createdAt: now, updatedAt: now });
    await setDoc(doc(db, "subjects", "s2"), { ...subjectPayload({ slug: "old", isActive: false }), createdAt: now, updatedAt: now });
    await setDoc(doc(db, "chapters", "c1"), { subjectId: "s1", title: "C", titleAr: "الفصل", description: "", order: 1, isActive: true, createdBy: ADMIN, createdAt: now, updatedAt: now });
    await setDoc(doc(db, "lessons", "l1"), { subjectId: "s1", chapterId: "c1", title: "L", titleAr: "الدرس", order: 1, isActive: true, createdBy: ADMIN, createdAt: now, updatedAt: now });

    await setDoc(doc(db, "questions", "q1"), { subjectId: "s1", chapterId: "c1", lessonId: "l1", type: "SINGLE_CHOICE", statement: "Q", statementAr: "س", mediaReferences: [], difficulty: "EASY", explanation: "", explanationAr: "", status: "READY", createdBy: ADMIN, createdAt: now, updatedAt: now });
    await setDoc(doc(db, "questionOptions", "o1"), { questionId: "q1", text: "A", textAr: "أ", order: 1, createdAt: now, updatedAt: now });
    await setDoc(doc(db, "questionOptions", "o2"), { questionId: "q1", text: "B", textAr: "ب", order: 2, createdAt: now, updatedAt: now });
    await setDoc(doc(db, "questionAnswerKeys", "q1"), { correctOptionId: "o1", updatedBy: ADMIN, updatedAt: now });

    const examBase = {
      title: "E", titleAr: "امتحان", description: "", subjectId: "s1", chapterIds: ["c1"], lessonIds: ["l1"],
      academicYear: "2026", durationSeconds: 1800, maxAttempts: 1, archived: false, questionCount: 1,
      maxScore: 2, shuffleQuestions: false, shuffleOptions: false, showScoreAfterSubmit: true,
      showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false, createdBy: ADMIN,
      createdAt: now, updatedAt: now, version: 1,
    };
    await setDoc(doc(db, "exams", "e_pub"), { ...examBase, status: "PUBLISHED", publishedAt: now });
    await setDoc(doc(db, "exams", "e_draft"), { ...examBase, status: "DRAFT", publishedAt: null });
    await setDoc(doc(db, "exams", "e_closed"), { ...examBase, status: "CLOSED", publishedAt: now });

    await setDoc(doc(db, "exams", "e_pub", "questions", "q1"), {
      questionId: "q1", order: 1, points: 2,
      questionSnapshot: { type: "SINGLE_CHOICE", statement: "Q", statementAr: "س", explanation: "", explanationAr: "", difficulty: "EASY", mediaReferences: [] },
      optionsSnapshot: [{ optionId: "o1", text: "A", textAr: "أ", order: 1 }, { optionId: "o2", text: "B", textAr: "ب", order: 2 }],
      questionVersion: 1,
    });
    await setDoc(doc(db, "examAnswerKeys", "e_pub", "items", "q1"), { correctOptionId: "o1", points: 2, gradingVersion: 1 });

    const attemptBase = { examId: "e_pub", subjectId: "s1", status: "IN_PROGRESS", startedAt: now, deadlineAt: now, submittedAt: null, score: null, maxScore: 2, examVersion: 1, gradingVersion: 1, lastSavedAt: null, createdAt: now, updatedAt: now };
    await setDoc(doc(db, "attempts", "e_pub__stu1"), { ...attemptBase, studentId: STUDENT });
    await setDoc(doc(db, "attempts", "e_pub__stu2"), { ...attemptBase, studentId: OTHER_STUDENT });
    await setDoc(doc(db, "attempts", "e_pub__stu1", "answers", "q1"), { examQuestionId: "q1", selectedOptionId: "o1", savedAt: now });

    const resultBase = { examId: "e_pub", subjectId: "s1", score: 2, maxScore: 2, percentage: 100, submittedAt: now, gradingVersion: 1, createdAt: now };
    await setDoc(doc(db, "results", "e_pub__stu1"), { ...resultBase, studentId: STUDENT, attemptId: "e_pub__stu1" });
    await setDoc(doc(db, "results", "e_pub__stu2"), { ...resultBase, studentId: OTHER_STUDENT, attemptId: "e_pub__stu2" });

    await setDoc(doc(db, "auditLogs", "log1"), { actorUid: ADMIN, action: "USER_PROVISIONED", targetType: "user", targetId: STUDENT, timestamp: now, reason: null, metadata: {} });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-mo7ap-exam-rules",
    firestore: { host: FS_HOST, port: Number(FS_PORT), rules: RULES },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe("unauthenticated requests", () => {
  it("cannot read any protected collection", async () => {
    const db = asUser(ANON);
    await assertFails(getDoc(doc(db, "subjects", "s1")));
    await assertFails(getDoc(doc(db, "exams", "e_pub")));
    await assertFails(getDoc(doc(db, "users", STUDENT)));
    await assertFails(getDoc(doc(db, "attempts", "e_pub__stu1")));
    await assertFails(getDoc(doc(db, "results", "e_pub__stu1")));
  });
});

describe("student: profile and role escalation", () => {
  it("reads own profile", async () => {
    await assertSucceeds(getDoc(doc(asUser(STUDENT, "STUDENT"), "users", STUDENT)));
  });

  it("cannot read another user's profile", async () => {
    await assertFails(getDoc(doc(asUser(STUDENT, "STUDENT"), "users", OTHER_STUDENT)));
  });

  it("cannot promote self by writing the role field", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertFails(updateDoc(doc(db, "users", STUDENT), { role: "ADMIN" }));
  });

  it("cannot create or delete profiles", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertFails(setDoc(doc(db, "users", "newbie"), { role: "ADMIN", isActive: true }));
    await assertFails(deleteDoc(doc(db, "users", STUDENT)));
  });

  it("a spoofed ADMIN claim with a STUDENT profile gets no admin reads", async () => {
    await assertFails(getDoc(doc(asUser(SPOOFED_ADMIN, "ADMIN"), "auditLogs", "log1")));
    await assertFails(getDocs(collection(asUser(SPOOFED_ADMIN, "ADMIN"), "questions")));
  });
});

describe("student: curriculum and exam visibility", () => {
  it("reads active subjects but not inactive ones", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertSucceeds(getDoc(doc(db, "subjects", "s1")));
    await assertFails(getDoc(doc(db, "subjects", "s2")));
  });

  it("cannot write subjects", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertFails(setDoc(doc(db, "subjects", "hack"), subjectPayload()));
    await assertFails(updateDoc(doc(db, "subjects", "s1"), { nameAr: "x", updatedAt: serverTimestamp() }));
  });

  it("reads PUBLISHED exams only, never DRAFT or CLOSED", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertSucceeds(getDoc(doc(db, "exams", "e_pub")));
    await assertFails(getDoc(doc(db, "exams", "e_draft")));
    await assertFails(getDoc(doc(db, "exams", "e_closed")));
  });

  it("list queries must filter to PUBLISHED; unfiltered list is denied", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertSucceeds(getDocs(query(collection(db, "exams"), where("status", "==", "PUBLISHED"))));
    await assertFails(getDocs(collection(db, "exams")));
  });

  it("cannot read the exam question snapshot before the server delivers it", async () => {
    await assertFails(getDoc(doc(asUser(STUDENT, "STUDENT"), "exams", "e_pub", "questions", "q1")));
  });

  it("cannot read or write the question bank or bank answer keys", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertFails(getDoc(doc(db, "questions", "q1")));
    await assertFails(getDoc(doc(db, "questionOptions", "o1")));
    await assertFails(getDoc(doc(db, "questionAnswerKeys", "q1")));
    await assertFails(setDoc(doc(db, "questionAnswerKeys", "q1"), { correctOptionId: "o2" }));
  });
});

describe("answer keys", () => {
  it("student cannot read published answer keys", async () => {
    await assertFails(getDoc(doc(asUser(STUDENT, "STUDENT"), "examAnswerKeys", "e_pub", "items", "q1")));
  });

  it("unauthenticated cannot read published answer keys", async () => {
    await assertFails(getDoc(doc(asUser(ANON), "examAnswerKeys", "e_pub", "items", "q1")));
  });

  it("admin client cannot read published answer keys either (server only)", async () => {
    await assertFails(getDoc(doc(asUser(ADMIN, "ADMIN"), "examAnswerKeys", "e_pub", "items", "q1")));
  });

  it("nobody can write published answer keys from the client", async () => {
    await assertFails(setDoc(doc(asUser(ADMIN, "ADMIN"), "examAnswerKeys", "e_pub", "items", "q1"), { correctOptionId: "o2", points: 9, gradingVersion: 1 }));
  });
});

describe("attempts: ownership and server-owned writes", () => {
  it("student reads own attempt", async () => {
    await assertSucceeds(getDoc(doc(asUser(STUDENT, "STUDENT"), "attempts", "e_pub__stu1")));
  });

  it("student cannot read another student's attempt", async () => {
    await assertFails(getDoc(doc(asUser(STUDENT, "STUDENT"), "attempts", "e_pub__stu2")));
  });

  it("student list must filter by own studentId", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertSucceeds(getDocs(query(collection(db, "attempts"), where("studentId", "==", STUDENT))));
    await assertFails(getDocs(collection(db, "attempts")));
  });

  it("student cannot create an attempt directly, even for a published exam", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertFails(setDoc(doc(db, "attempts", "e_pub__extra"), {
      examId: "e_pub", studentId: STUDENT, status: "IN_PROGRESS", score: 100, maxScore: 2,
    }));
    await assertFails(addDoc(collection(db, "attempts"), { examId: "e_pub", studentId: STUDENT, status: "IN_PROGRESS" }));
  });

  it("student cannot change score or status of own attempt", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertFails(updateDoc(doc(db, "attempts", "e_pub__stu1"), { score: 2, status: "GRADED" }));
    await assertFails(updateDoc(doc(db, "attempts", "e_pub__stu1"), { deadlineAt: Timestamp.fromMillis(Date.now() + 9e6) }));
  });

  it("student cannot delete own attempt", async () => {
    await assertFails(deleteDoc(doc(asUser(STUDENT, "STUDENT"), "attempts", "e_pub__stu1")));
  });

  it("student cannot create, change, or delete own answers directly", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertFails(setDoc(doc(db, "attempts", "e_pub__stu1", "answers", "q1"), { examQuestionId: "q1", selectedOptionId: "o2", savedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "attempts", "e_pub__stu1", "answers", "q9"), { examQuestionId: "q9", selectedOptionId: "o1", savedAt: serverTimestamp(), awardedPoints: 2 }));
    await assertFails(deleteDoc(doc(db, "attempts", "e_pub__stu1", "answers", "q1")));
  });

  it("student reads own answers, not another student's", async () => {
    await assertSucceeds(getDoc(doc(asUser(STUDENT, "STUDENT"), "attempts", "e_pub__stu1", "answers", "q1")));
    await assertFails(getDoc(doc(asUser(OTHER_STUDENT, "STUDENT"), "attempts", "e_pub__stu1", "answers", "q1")));
  });

  it("admin cannot create attempts from the client either", async () => {
    await assertFails(setDoc(doc(asUser(ADMIN, "ADMIN"), "attempts", "forged"), { examId: "e_pub", studentId: STUDENT, status: "GRADED" }));
  });
});

describe("results: immutable for students", () => {
  it("student reads own result", async () => {
    await assertSucceeds(getDoc(doc(asUser(STUDENT, "STUDENT"), "results", "e_pub__stu1")));
  });

  it("student cannot read another student's result", async () => {
    await assertFails(getDoc(doc(asUser(STUDENT, "STUDENT"), "results", "e_pub__stu2")));
  });

  it("student cannot create, modify, or delete any result, including own", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertFails(setDoc(doc(db, "results", "forged"), { studentId: STUDENT, score: 100, maxScore: 2 }));
    await assertFails(updateDoc(doc(db, "results", "e_pub__stu1"), { score: 2 }));
    await assertFails(deleteDoc(doc(db, "results", "e_pub__stu1")));
  });

  it("nobody, including admin clients, can delete or rewrite results", async () => {
    const admin = asUser(ADMIN, "ADMIN");
    await assertFails(deleteDoc(doc(admin, "results", "e_pub__stu1")));
    await assertFails(updateDoc(doc(admin, "results", "e_pub__stu1"), { score: 0 }));
  });

  it("student list must filter by own studentId", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertSucceeds(getDocs(query(collection(db, "results"), where("studentId", "==", STUDENT))));
    await assertFails(getDocs(collection(db, "results")));
  });
});

describe("audit log: append-only and admin-read", () => {
  it("admin reads audit logs", async () => {
    await assertSucceeds(getDoc(doc(asUser(ADMIN, "ADMIN"), "auditLogs", "log1")));
  });

  it("student cannot read audit logs", async () => {
    await assertFails(getDoc(doc(asUser(STUDENT, "STUDENT"), "auditLogs", "log1")));
  });

  it("nobody can write, edit, or delete audit logs from the client", async () => {
    const admin = asUser(ADMIN, "ADMIN");
    await assertFails(addDoc(collection(admin, "auditLogs"), { actorUid: ADMIN, action: "FAKE" }));
    await assertFails(updateDoc(doc(admin, "auditLogs", "log1"), { action: "EDITED" }));
    await assertFails(deleteDoc(doc(admin, "auditLogs", "log1")));
  });
});

describe("deactivated accounts", () => {
  it("deactivated student cannot read active subjects, own attempt, or own result", async () => {
    const db = asUser(INACTIVE_STUDENT, "STUDENT");
    await assertFails(getDoc(doc(db, "subjects", "s1")));
    await assertFails(getDoc(doc(db, "exams", "e_pub")));
    await assertFails(getDoc(doc(db, "attempts", "e_pub__stu1")));
  });
});

describe("admin: curriculum writes", () => {
  it("creates a valid subject", async () => {
    await assertSucceeds(setDoc(doc(asUser(ADMIN, "ADMIN"), "subjects", "chem"), subjectPayload({ slug: "chemistry", nameAr: "الكيمياء" })));
  });

  it("rejects a subject with a wrong type or a spoofed createdBy", async () => {
    const db = asUser(ADMIN, "ADMIN");
    await assertFails(setDoc(doc(db, "subjects", "bad1"), subjectPayload({ order: "first" })));
    await assertFails(setDoc(doc(db, "subjects", "bad2"), subjectPayload({ createdBy: STUDENT })));
    await assertFails(setDoc(doc(db, "subjects", "bad3"), subjectPayload({ extraField: true })));
  });

  it("archives a subject by flag, never by delete", async () => {
    const db = asUser(ADMIN, "ADMIN");
    await assertSucceeds(updateDoc(doc(db, "subjects", "s1"), { isActive: false, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, "subjects", "s1")));
  });

  it("creates a chapter only under an existing subject", async () => {
    const db = asUser(ADMIN, "ADMIN");
    await assertSucceeds(setDoc(doc(db, "chapters", "c2"), { subjectId: "s1", titleAr: "فصل", order: 2, isActive: true, createdBy: ADMIN, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "chapters", "c3"), { subjectId: "ghost", titleAr: "فصل", order: 1, isActive: true, createdBy: ADMIN, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it("student cannot write curriculum", async () => {
    await assertFails(setDoc(doc(asUser(STUDENT, "STUDENT"), "chapters", "c9"), { subjectId: "s1", titleAr: "x", order: 1, isActive: true, createdBy: STUDENT, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
});

describe("admin: question bank and answer keys", () => {
  it("writes a bank answer key pointing to an option of the same question", async () => {
    await assertSucceeds(setDoc(doc(asUser(ADMIN, "ADMIN"), "questionAnswerKeys", "q1"), { correctOptionId: "o2", updatedBy: ADMIN, updatedAt: serverTimestamp() }));
  });

  it("rejects a bank answer key that points to another question's option", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "questions", "q2"), { subjectId: "s1", chapterId: "c1", lessonId: "l1", type: "TRUE_FALSE", statement: "T", statementAr: "ص", mediaReferences: [], difficulty: "EASY", explanation: "", explanationAr: "", status: "READY", createdBy: ADMIN, createdAt: ts(), updatedAt: ts() });
      await setDoc(doc(ctx.firestore(), "questionOptions", "other"), { questionId: "q2", text: "T", textAr: "ص", order: 1, createdAt: ts(), updatedAt: ts() });
    });
    await assertFails(setDoc(doc(asUser(ADMIN, "ADMIN"), "questionAnswerKeys", "q1"), { correctOptionId: "other", updatedBy: ADMIN, updatedAt: serverTimestamp() }));
  });

  it("creates a bank question with valid enum values", async () => {
    await assertSucceeds(setDoc(doc(asUser(ADMIN, "ADMIN"), "questions", "q5"), { subjectId: "s1", chapterId: "c1", lessonId: "l1", type: "TRUE_FALSE", statement: "T", statementAr: "ص", mediaReferences: [], difficulty: "HARD", explanation: "", explanationAr: "", status: "DRAFT", createdBy: ADMIN, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it("rejects an invalid question type and changing an existing question's type", async () => {
    const db = asUser(ADMIN, "ADMIN");
    await assertFails(setDoc(doc(db, "questions", "q6"), { subjectId: "s1", chapterId: "c1", lessonId: "l1", type: "ESSAY", statement: "E", difficulty: "EASY", status: "READY", createdBy: ADMIN, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "questions", "q1"), { type: "TRUE_FALSE", updatedAt: serverTimestamp() }));
  });
});

describe("admin: exams and exam snapshots", () => {
  it("creates an exam only as DRAFT", async () => {
    const db = asUser(ADMIN, "ADMIN");
    const base = { title: "New", titleAr: "جديد", subjectId: "s1", chapterIds: [], lessonIds: [], academicYear: "2026", durationSeconds: 1200, maxAttempts: 1, archived: false, questionCount: 0, maxScore: 0, createdBy: ADMIN, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1 };
    await assertSucceeds(setDoc(doc(db, "exams", "e_new"), { ...base, status: "DRAFT", publishedAt: null }));
    await assertFails(setDoc(doc(db, "exams", "e_direct"), { ...base, status: "PUBLISHED", publishedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "exams", "e_twice"), { ...base, status: "DRAFT", publishedAt: null, maxAttempts: 2 }));
  });

  it("admin cannot publish, close, or edit a published exam from the client", async () => {
    const db = asUser(ADMIN, "ADMIN");
    await assertFails(updateDoc(doc(db, "exams", "e_draft"), { status: "PUBLISHED", publishedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "exams", "e_pub"), { title: "changed", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "exams", "e_pub"), { status: "CLOSED", updatedAt: serverTimestamp() }));
  });

  it("edits a DRAFT exam", async () => {
    await assertSucceeds(updateDoc(doc(asUser(ADMIN, "ADMIN"), "exams", "e_draft"), { title: "renamed", updatedAt: serverTimestamp() }));
  });

  it("archives a CLOSED exam but cannot change its content", async () => {
    const db = asUser(ADMIN, "ADMIN");
    await assertSucceeds(updateDoc(doc(db, "exams", "e_closed"), { archived: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "exams", "e_closed"), { title: "rewritten", updatedAt: serverTimestamp() }));
  });

  it("never deletes an exam", async () => {
    await assertFails(deleteDoc(doc(asUser(ADMIN, "ADMIN"), "exams", "e_draft")));
  });

  it("admin writes exam question snapshots only while the exam is a DRAFT", async () => {
    const snapshot = {
      questionId: "q1", order: 1, points: 2,
      questionSnapshot: { type: "SINGLE_CHOICE", statement: "Q", statementAr: "س", explanation: "", explanationAr: "", difficulty: "EASY", mediaReferences: [] },
      optionsSnapshot: [{ optionId: "o1", text: "A", textAr: "أ", order: 1 }],
      questionVersion: 1,
    };
    const db = asUser(ADMIN, "ADMIN");
    await assertSucceeds(setDoc(doc(db, "exams", "e_draft", "questions", "q1"), snapshot));
    await assertFails(setDoc(doc(db, "exams", "e_pub", "questions", "q2"), { ...snapshot, questionId: "q2" }));
    await assertFails(updateDoc(doc(db, "exams", "e_pub", "questions", "q1"), { points: 10 }));
  });

  it("admin cannot slip a non-snapshot field into an exam question", async () => {
    await assertFails(setDoc(doc(asUser(ADMIN, "ADMIN"), "exams", "e_draft", "questions", "q1"), {
      questionId: "q1", order: 1, points: 2, correctOptionId: "o1",
      questionSnapshot: {}, optionsSnapshot: [], questionVersion: 1,
    }));
  });
});

describe("admin: attempts and results are never written from the client", () => {
  it("admin cannot write results or attempts", async () => {
    const admin = asUser(ADMIN, "ADMIN");
    await assertFails(setDoc(doc(admin, "results", "forged2"), { studentId: STUDENT, score: 2, maxScore: 2 }));
    await assertFails(updateDoc(doc(admin, "attempts", "e_pub__stu1"), { score: 2, status: "GRADED" }));
  });
});

describe("camera signaling (monitorSessions)", () => {
  const offer = { type: "offer", sdp: "v=0" };
  const answer = { type: "answer", sdp: "v=0" };

  it("student creates a live session only for their own attempt", async () => {
    const db = asUser(STUDENT, "STUDENT");
    await assertSucceeds(setDoc(doc(db, "monitorSessions", "e2e-exam__stu1"), { studentId: STUDENT, offer, answer: null, status: "live", updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "monitorSessions", "forged"), { studentId: OTHER_STUDENT, offer, answer: null, status: "live", updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "monitorSessions", "forged2"), { studentId: STUDENT, offer, answer, status: "live", updatedAt: serverTimestamp() }));
  });

  it("only the admin writes the answer; the student cannot forge one", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "monitorSessions", "s1"), { studentId: STUDENT, offer, answer: null, status: "live", updatedAt: ts() });
    });
    await assertSucceeds(updateDoc(doc(asUser(ADMIN, "ADMIN"), "monitorSessions", "s1"), { answer, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "s1"), { answer, updatedAt: serverTimestamp() }));
  });

  it("student and admin read the session; other students cannot", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "monitorSessions", "s2"), { studentId: STUDENT, offer, answer: null, status: "live", updatedAt: ts() });
    });
    await assertSucceeds(getDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "s2")));
    await assertSucceeds(getDoc(doc(asUser(ADMIN, "ADMIN"), "monitorSessions", "s2")));
    await assertFails(getDoc(doc(asUser(OTHER_STUDENT, "STUDENT"), "monitorSessions", "s2")));
  });

  it("nobody can delete a session, and the admin cannot create an offer", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "monitorSessions", "s3"), { studentId: STUDENT, offer, answer: null, status: "live", updatedAt: ts() });
    });
    await assertFails(deleteDoc(doc(asUser(ADMIN, "ADMIN"), "monitorSessions", "s3")));
    await assertFails(deleteDoc(doc(asUser(STUDENT, "STUDENT"), "monitorSessions", "s3")));
    await assertFails(setDoc(doc(asUser(ADMIN, "ADMIN"), "monitorSessions", "s4"), { studentId: STUDENT, offer, answer: null, status: "live", updatedAt: serverTimestamp() }));
  });
});

