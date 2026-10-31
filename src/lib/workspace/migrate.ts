import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { MAIN_WORKSPACE_ID } from "./index";

/** Collections listed by workspace. Their documents saved before spaces existed get the main space. */
const SCOPED_COLLECTIONS = ["users", "subjects", "chapters", "lessons", "questions", "exams", "attempts", "results", "questionMedia"];
const MARKER = { collection: "system", doc: "migrations", field: "workspacesV1" } as const;
const BATCH_LIMIT = 400;

let done = false;

/**
 * One-time move of pre-spaces data into the main space. Lists filter by workspaceId, and Firestore
 * cannot query a missing field, so old documents must carry it before they show up again.
 * Idempotent and safe to run twice at once: it only fills workspaceId where it is missing.
 */
export async function ensureWorkspacesMigrated(db: Firestore): Promise<void> {
  if (done) return;
  const markerRef = db.collection(MARKER.collection).doc(MARKER.doc);
  if ((await markerRef.get()).data()?.[MARKER.field] === true) {
    done = true;
    return;
  }
  await migrateToMainWorkspace(db);
  await markerRef.set({ [MARKER.field]: true, [`${MARKER.field}At`]: FieldValue.serverTimestamp() }, { merge: true });
  done = true;
}

export async function migrateToMainWorkspace(db: Firestore): Promise<number> {
  let updated = 0;
  for (const name of SCOPED_COLLECTIONS) {
    const missing = (await db.collection(name).get()).docs.filter((doc) => typeof doc.data().workspaceId !== "string");
    for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      missing.slice(i, i + BATCH_LIMIT).forEach((doc) => batch.update(doc.ref, { workspaceId: MAIN_WORKSPACE_ID }));
      await batch.commit();
    }
    updated += missing.length;
  }

  const mainRef = db.collection("workspaces").doc(MAIN_WORKSPACE_ID);
  if (!(await mainRef.get()).exists) {
    const admins = await db.collection("users").where("role", "==", "ADMIN").get();
    await mainRef.set({
      name: "المساحة الرئيسية",
      ownerUids: admins.docs.map((doc) => doc.id),
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return updated;
}

/** Tests reset the per-process memo between runs. */
export function resetMigrationMemo() {
  done = false;
}
