import chemistryCh1Medium from "../../../content/chemistry-ch1-medium.json";
import chemistryCh1Hard from "../../../content/chemistry-ch1-hard.json";
import biologyCh2Hard from "../../../content/biology-ch2-hard.json";
import type { ContentPack } from "./importer";

/** Ready exams shipped with the app. The admin adds each one with a click. */
export const CONTENT_PACKS: { id: string; pack: ContentPack }[] = [
  { id: "chemistry-ch1-medium", pack: chemistryCh1Medium as ContentPack },
  { id: "chemistry-ch1-hard", pack: chemistryCh1Hard as ContentPack },
  { id: "biology-ch2-hard", pack: biologyCh2Hard as ContentPack },
];
