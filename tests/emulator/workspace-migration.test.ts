import { beforeAll, describe, expect, it } from "vitest";

process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminDb } = await import("@/lib/firebase/admin-core");
const { migrateToMainWorkspace, ensureWorkspacesMigrated, resetMigrationMemo } = await import("@/lib/workspace/migrate");
const curriculum = await import("@/features/curriculum/service");
const exams = await import("@/features/exams/service");
const students = await import("@/features/students/service");

const db = getAdminDb();
const tag = Date.now().toString(36);

describe("moving pre-spaces data into the main space (Firestore emulator)", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:emulator`.");
  });

  it("old documents show up in the main space after the migration, and new spaces stay apart", async () => {
    // Documents exactly as the site saved them before spaces existed: no workspaceId.
    await db.collection("subjects").doc(`old-subject-${tag}`).set({ name: "Old", nameAr: "قديمة", slug: `old-${tag}`, order: 1, isActive: true, academicYear: "2026", curriculum: "x", applicableTracks: [] });
    await db.collection("exams").doc(`old-exam-${tag}`).set({ title: "Old", titleAr: `قديم ${tag}`, status: "PUBLISHED", archived: false, subjectId: `old-subject-${tag}` });
    await db.collection("users").doc(`old-student-${tag}`).set({ uid: `old-student-${tag}`, role: "STUDENT", isActive: true, displayName: "قديم", email: null });
    await db.collection("users").doc(`old-admin-${tag}`).set({ uid: `old-admin-${tag}`, role: "ADMIN", isActive: true, displayName: "مشرف", email: null });

    expect((await curriculum.listSubjects(db, "main")).map((s) => s.id)).not.toContain(`old-subject-${tag}`);

    await migrateToMainWorkspace(db);

    expect((await curriculum.listSubjects(db, "main")).map((s) => s.id)).toContain(`old-subject-${tag}`);
    expect((await exams.listExams(db, "main")).map((e) => e.id)).toContain(`old-exam-${tag}`);
    expect((await students.listStudents(db, "main")).map((s) => s.uid)).toContain(`old-student-${tag}`);
    expect((await curriculum.listSubjects(db, `other-${tag}`)).map((s) => s.id)).not.toContain(`old-subject-${tag}`);
    expect((await db.collection("workspaces").doc("main").get()).exists).toBe(true);
  });

  it("never moves a document that already belongs to a space", async () => {
    await db.collection("subjects").doc(`owned-${tag}`).set({ name: "B", nameAr: "ب", slug: `owned-${tag}`, order: 1, isActive: true, workspaceId: `ws-b-${tag}` });
    await migrateToMainWorkspace(db);
    expect((await db.collection("subjects").doc(`owned-${tag}`).get()).data()?.workspaceId).toBe(`ws-b-${tag}`);
  });

  it("runs once: the marker stops later requests from rescanning", async () => {
    resetMigrationMemo();
    await ensureWorkspacesMigrated(db);
    expect((await db.collection("system").doc("migrations").get()).data()?.workspacesV1).toBe(true);
    await db.collection("subjects").doc(`late-${tag}`).set({ nameAr: "متأخرة", slug: `late-${tag}`, order: 1, isActive: true });
    resetMigrationMemo();
    await ensureWorkspacesMigrated(db);
    expect((await db.collection("subjects").doc(`late-${tag}`).get()).data()?.workspaceId).toBeUndefined();
  });
});
