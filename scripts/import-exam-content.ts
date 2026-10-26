/**
 * Loads an exam content file (content/*.json) from the command line. Same importer as the
 * "امتحانات جاهزة" buttons on /admin/exams; see src/features/content-packs/importer.ts.
 *
 *   npx tsx --conditions=react-server scripts/import-exam-content.ts [content/chemistry-ch1-medium.json]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getAdminDb } from "../src/lib/firebase/admin-core";
import { importContentPack, type ContentPack } from "../src/features/content-packs/importer";

const contentFile = process.argv[2] ?? "content/chemistry-ch1-medium.json";
const pack = JSON.parse(readFileSync(path.resolve(contentFile), "utf8")) as ContentPack;

importContentPack(getAdminDb(), "content-import", pack, console.log)
  .then((result) => console.log(result.status === "published" ? `exam published ${result.examId} code ${result.accessCode}` : `exam exists ${result.examId}`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
