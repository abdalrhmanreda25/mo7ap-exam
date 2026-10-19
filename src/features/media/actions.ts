"use server";

import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { runAdminAction } from "@/lib/server/action";
import { saveMedia } from "./service";

export async function uploadQuestionMediaAction(dataUrl: string) {
  return runAdminAction(async (actor) => ({
    url: await saveMedia(getAdminDb(), actor, z.string().max(800_000).parse(dataUrl)),
  }));
}
