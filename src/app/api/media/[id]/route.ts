import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { readMedia } from "@/features/media/service";

/** Serves a question image to any signed-in user. Images carry no answer information. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const media = await readMedia(getAdminDb(), id);
  if (!media) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(media.bytes), {
    headers: {
      "Content-Type": media.mime,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
