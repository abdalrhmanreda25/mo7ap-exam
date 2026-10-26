"use server";

import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { runAdminAction } from "@/lib/server/action";
import { DomainError } from "@/lib/server/errors";
import { importContentPack } from "./importer";
import { CONTENT_PACKS } from "./packs";

const packIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/, { error: "معرّف غير صالح." });

export async function importContentPackAction(packId: string) {
  return runAdminAction(async (actor) => {
    const entry = CONTENT_PACKS.find((p) => p.id === packIdSchema.parse(packId));
    if (!entry) throw new DomainError("الامتحان الجاهز غير موجود.");
    try {
      return await importContentPack(getAdminDb(), actor, entry.pack);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(error instanceof Error ? error.message : "تعذر إضافة الامتحان.");
    }
  });
}
