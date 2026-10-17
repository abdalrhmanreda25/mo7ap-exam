/**
 * Seeds emulator-only E2E accounts through the trusted provisioning path,
 * then sets passwords with the Admin SDK. Runs before Playwright, under tsx,
 * because Playwright's loader cannot load firebase-admin. Refuses to run
 * without the Auth emulator.
 */
import { ACCOUNTS, TEST_PASSWORD } from "../tests/e2e/accounts";
import { getAdminAuth } from "../src/lib/firebase/admin-core";
import { provisionUser, setUserActive } from "../src/lib/auth/provisioning";
import { getAdminDb } from "../src/lib/firebase/admin-core";
import { FieldValue } from "firebase-admin/firestore";

/** One published exam with two questions and known keys (Q1 correct = b, Q2 correct = a). Fixed IDs, idempotent. */
async function seedPublishedExam() {
  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();
  const subjectId = "e2e-subject";
  const chapterId = "e2e-chapter";
  const lessonId = "e2e-lesson";
  await db.collection("subjects").doc(subjectId).set({ name: "E2E", nameAr: "مادة اختبار", slug: "e2e-subject", description: "", academicYear: "2026", curriculum: "x", applicableTracks: [], order: 99, isActive: true, createdBy: "e2e-seed", createdAt: now, updatedAt: now });
  await db.collection("chapters").doc(chapterId).set({ subjectId, title: "C", titleAr: "فصل اختبار", description: "", order: 1, isActive: true, createdBy: "e2e-seed", createdAt: now, updatedAt: now });
  await db.collection("lessons").doc(lessonId).set({ subjectId, chapterId, title: "L", titleAr: "درس اختبار", order: 1, isActive: true, createdBy: "e2e-seed", createdAt: now, updatedAt: now });

  const questions = [
    { id: "e2e-q1", statementAr: "سؤال أول", statement: "First", correct: "b", points: 2 },
    { id: "e2e-q2", statementAr: "سؤال ثان", statement: "Second", correct: "a", points: 3 },
  ];
  const options = [
    { id: "a", textAr: "أ", text: "A", order: 1 },
    { id: "b", textAr: "ب", text: "B", order: 2 },
    { id: "c", textAr: "ج", text: "C", order: 3 },
  ];
  const examRef = db.collection("exams").doc("e2e-exam");
  await examRef.set({ title: "E2E quick exam", titleAr: "اختبار سريع E2E", description: "", subjectId, chapterIds: [chapterId], lessonIds: [lessonId], academicYear: "2026", durationSeconds: 600, maxAttempts: 1, status: "PUBLISHED", archived: false, questionCount: 2, maxScore: 5, shuffleQuestions: false, shuffleOptions: false, showScoreAfterSubmit: true, showCorrectAnswersAfterSubmit: false, showExplanationsAfterSubmit: false, publishedAt: now, createdBy: "e2e-seed", createdAt: now, updatedAt: now, version: 1 });

  for (const [i, q] of questions.entries()) {
    const prefix = `${q.id}__`;
    await db.collection("questions").doc(q.id).set({ subjectId, chapterId, lessonId, type: "SINGLE_CHOICE", statement: q.statement, statementAr: q.statementAr, mediaReferences: [], difficulty: "EASY", explanation: "", explanationAr: "", status: "READY", createdBy: "e2e-seed", createdAt: now, updatedAt: now });
    for (const o of options) {
      await db.collection("questionOptions").doc(prefix + o.id).set({ questionId: q.id, text: o.text, textAr: o.textAr, order: o.order, createdAt: now, updatedAt: now });
    }
    await db.collection("questionAnswerKeys").doc(q.id).set({ correctOptionId: prefix + q.correct, updatedBy: "e2e-seed", updatedAt: now });
    await examRef.collection("questions").doc(q.id).set({
      questionId: q.id, order: i + 1, points: q.points,
      questionSnapshot: { type: "SINGLE_CHOICE", statement: q.statement, statementAr: q.statementAr, explanation: "", explanationAr: "", difficulty: "EASY", mediaReferences: [] },
      optionsSnapshot: options.map((o) => ({ optionId: o.id, text: o.text, textAr: o.textAr, order: o.order })),
      questionVersion: 1,
    });
    await db.collection("examAnswerKeys").doc("e2e-exam").collection("items").doc(q.id).set({ correctOptionId: q.correct, points: q.points, gradingVersion: 1 });
  }
}

async function main() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("E2E seed must run against the Auth emulator. Use `npm run test:e2e`.");
  }

  for (const account of Object.values(ACCOUNTS)) {
    const result = await provisionUser({
      email: account.email,
      displayName: account.name,
      role: account.role,
      actorUid: "e2e-seed",
    });
    await getAdminAuth().updateUser(result.uid, { password: TEST_PASSWORD });
  }

  await setUserActive({ email: ACCOUNTS.disabled.email, active: false, actorUid: "e2e-seed" });
  await seedPublishedExam();
  console.log("E2E accounts and published exam seeded.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
