import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb } = await import("@/lib/firebase/admin-core");
const curriculum = await import("@/features/curriculum/service");
const exams = await import("@/features/exams/service");
const { importContentPack } = await import("@/features/content-packs/importer");
const { CONTENT_PACKS } = await import("@/features/content-packs/packs");

const db = getAdminDb();
const ADMIN = "test-admin";

async function ensureSubject(slug: string) {
  const snap = await db.collection("subjects").where("slug", "==", slug).limit(1).get();
  if (!snap.empty) return;
  await curriculum.createSubject(db, ADMIN, {
    name: slug, nameAr: slug, slug, description: "", academicYear: "2026", curriculum: "x", applicableTracks: [], order: 1, isActive: true,
  });
}

describe("ready exam packs (Firestore emulator)", () => {
  beforeAll(async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
    for (const { pack } of CONTENT_PACKS) await ensureSubject(pack.subjectSlug ?? "chemistry");
  });

  it("every pack is well formed", () => {
    for (const { id, pack } of CONTENT_PACKS) {
      const lessonKeys = new Set(pack.lessons.map((l) => l.key));
      for (const q of pack.questions) {
        expect(lessonKeys.has(q.lesson), `${id}: ${q.q}`).toBe(true);
        expect(q.correct, `${id}: ${q.q}`).toBeGreaterThanOrEqual(1);
        expect(q.correct, `${id}: ${q.q}`).toBeLessThanOrEqual(q.options.length);
      }
      expect(new Set(pack.questions.map((q) => q.q)).size, id).toBe(pack.questions.length);
    }
  });

  it("publishes the exam with a code once, then reports it exists", async () => {
    const { pack } = CONTENT_PACKS.find((p) => p.id === "biology-ch2-hard")!;
    const first = await importContentPack(db, ADMIN, pack);
    expect(first.status).toBe("published");
    if (first.status !== "published") return;
    expect(first.questionCount).toBe(pack.questions.length);

    const exam = await exams.getExam(db, first.examId);
    expect(exam?.status).toBe("PUBLISHED");
    expect(exam?.maxScore).toBe(pack.questions.length * pack.exam.pointsPerQuestion);
    expect(await exams.getAccessCode(db, first.examId)).toBe(first.accessCode);

    const again = await importContentPack(db, ADMIN, pack);
    expect(again).toEqual({ status: "exists", examId: first.examId });
    const sameTitle = await db.collection("exams").where("titleAr", "==", pack.exam.titleAr).get();
    expect(sameTitle.size).toBe(1);
  });
});
