import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { DomainError } from "@/lib/server/errors";

/**
 * Question images stored in Firestore (no Firebase Storage needed). Each image is one document,
 * already compressed in the browser and capped well under Firestore's 1 MiB document limit.
 * Clients never read the collection directly; images are served by /api/media/[id] to signed-in users.
 */
export const MEDIA_COLLECTION = "questionMedia";
export const MAX_MEDIA_BYTES = 500 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new DomainError("صيغة الصورة غير صالحة.");
  const [, mime, base64] = match;
  if (!ALLOWED.has(mime)) throw new DomainError("الصيغ المسموحة: PNG أو JPEG أو WebP.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new DomainError("الصورة فارغة.");
  if (bytes.length > MAX_MEDIA_BYTES) throw new DomainError("حجم الصورة أكبر من 500 كيلوبايت بعد الضغط.");
  return { mime, bytes };
}

export async function saveMedia(db: Firestore, actorUid: string, dataUrl: string): Promise<string> {
  const { mime, bytes } = parseDataUrl(dataUrl);
  const ref = db.collection(MEDIA_COLLECTION).doc();
  await ref.set({ mime, data: bytes, size: bytes.length, createdBy: actorUid, createdAt: FieldValue.serverTimestamp() });
  return `/api/media/${ref.id}`;
}

export async function readMedia(db: Firestore, id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await db.collection(MEDIA_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { mime: d.mime as string, bytes: Buffer.from(d.data as Uint8Array) };
}
