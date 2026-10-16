/**
 * Adds the Thanaweya Amma subjects. Idempotent: subjects whose slug already exists are skipped.
 * Runs against whatever project the environment points to (emulator or real project).
 *
 *   npx tsx --env-file=.env.local scripts/seed-subjects.ts     # emulator
 *   FIREBASE_SERVICE_ACCOUNT_JSON=... npx tsx scripts/seed-subjects.ts   # real project
 */
import { FieldValue } from "firebase-admin/firestore";
import { auditLogWrite } from "../src/lib/audit/log";
import { getAdminDb } from "../src/lib/firebase/admin-core";
import { COLLECTIONS } from "../src/types/firestore";

const SUBJECTS = [
  { slug: "biology", name: "Biology", nameAr: "الأحياء", order: 1 },
  { slug: "chemistry", name: "Chemistry", nameAr: "الكيمياء", order: 2 },
  { slug: "physics", name: "Physics", nameAr: "الفيزياء", order: 3 },
  { slug: "arabic", name: "Arabic", nameAr: "اللغة العربية", order: 4 },
  { slug: "english", name: "English", nameAr: "اللغة الإنجليزية", order: 5 },
] as const;

const ACTOR = "seed-subjects-script";

async function main() {
  const db = getAdminDb();
  for (const subject of SUBJECTS) {
    const existing = await db.collection(COLLECTIONS.subjects).where("slug", "==", subject.slug).limit(1).get();
    if (!existing.empty) {
      console.log(`skip  ${subject.slug} (exists)`);
      continue;
    }
    const ref = db.collection(COLLECTIONS.subjects).doc();
    const audit = auditLogWrite(db, ACTOR, {
      action: "SUBJECT_CREATED",
      targetType: "subject",
      targetId: ref.id,
      metadata: { slug: subject.slug, source: "seed-subjects" },
    });
    const batch = db.batch();
    batch.set(ref, {
      name: subject.name,
      nameAr: subject.nameAr,
      slug: subject.slug,
      description: "",
      academicYear: "الثانوية العامة",
      curriculum: "الثانوية العامة",
      applicableTracks: [],
      order: subject.order,
      isActive: true,
      createdBy: ACTOR,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(audit.ref, audit.data);
    await batch.commit();
    console.log(`added ${subject.slug} ${subject.nameAr}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
