/**
 * Resizes an image in the browser before upload so it fits comfortably in one Firestore document.
 * Diagrams keep PNG (sharp lines); photos become JPEG. Returns a data URL.
 */
export async function compressImage(file: File, maxWidth = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const png = canvas.toDataURL("image/png");
  if (png.length * 0.75 <= 400 * 1024) return png;
  return canvas.toDataURL("image/jpeg", 0.85);
}
