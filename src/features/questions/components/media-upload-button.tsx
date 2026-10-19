"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/client/compress-image";
import { uploadQuestionMediaAction } from "@/features/media/actions";

export function MediaUploadButton({ onUploaded }: { onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="رفع صورة للسؤال"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setPending(true);
          try {
            const dataUrl = await compressImage(file);
            const result = await uploadQuestionMediaAction(dataUrl);
            if (result.ok) {
              onUploaded(result.data.url);
              toast.success("تم رفع الصورة.");
            } else toast.error(result.message);
          } catch {
            toast.error("تعذر قراءة الصورة. جرّب صورة PNG أو JPEG.");
          } finally {
            setPending(false);
          }
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
        <ImagePlus className="size-4" aria-hidden="true" />
        {pending ? "جارٍ الرفع..." : "رفع صورة"}
      </Button>
    </div>
  );
}
