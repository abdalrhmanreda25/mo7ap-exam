"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reportResult } from "@/lib/client/result";
import { commitImportAction, previewImportAction, type ImportKind, type ImportPreview } from "../actions";

const TEMPLATE: Record<ImportKind, { file: string; label: string }> = {
  subjects: { file: "subjects.csv", label: "المواد" },
  chapters: { file: "chapters.csv", label: "الفصول" },
  lessons: { file: "lessons.csv", label: "الدروس" },
  questions: { file: "questions.csv", label: "الأسئلة" },
  examQuestions: { file: "exam-questions.csv", label: "أسئلة الامتحان" },
};

/**
 * Bulk import from .xlsx or .csv. Step 1 validates and shows every row error.
 * Step 2 writes only when the whole file is valid. The server re-validates on commit.
 */
export function ImportDialog({ kind, examId }: { kind: ImportKind; examId?: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, startTransition] = useTransition();
  const template = TEMPLATE[kind];

  const formFor = (f: File) => {
    const data = new FormData();
    data.append("file", f);
    if (examId) data.append("examId", examId);
    return data;
  };

  const runPreview = (f: File) => {
    setFile(f);
    setPreview(null);
    startTransition(async () => {
      const result = await previewImportAction(kind, formFor(f));
      if (result.ok) setPreview(result.data);
      else {
        toast.error(result.message);
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };

  const commit = () => {
    if (!file) return;
    startTransition(async () => {
      const result = await commitImportAction(kind, formFor(file));
      if (reportResult(result, "تم الاستيراد بنجاح.")) {
        dialogRef.current?.close();
        setFile(null);
        setPreview(null);
        router.refresh();
      }
    });
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const canCommit = Boolean(preview && preview.errors.length === 0 && preview.valid > 0);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => dialogRef.current?.showModal()}>
        <Upload className="size-4" aria-hidden="true" />
        استيراد {template.label} من Excel
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`import-title-${kind}`}
        onClose={reset}
        className="w-[min(94vw,40rem)] rounded-2xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="space-y-5 p-6">
          <div className="space-y-1">
            <h2 id={`import-title-${kind}`} className="text-lg font-bold">
              استيراد {template.label} من ملف
            </h2>
            <p className="text-sm text-muted-foreground">
              ارفع ملف .xlsx أو .csv. أول صف هو العناوين، والأعمدة كما في النموذج.
            </p>
          </div>

          <Link
            href={kind === "examQuestions" && examId ? `/api/templates/exam-questions?examId=${examId}` : `/templates/${template.file}`}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            download
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            تحميل النموذج
          </Link>

          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-border p-6 text-center hover:border-primary/50">
            <span className="block text-sm font-medium">{file ? file.name : "اختر ملفًا"}</span>
            <span className="mt-1 block text-xs text-muted-foreground">حتى 2 ميجابايت و500 صف</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) runPreview(selected);
              }}
            />
          </label>

          {pending && <p role="status" className="text-sm text-muted-foreground">جارٍ التحقق من الملف...</p>}

          {preview && (
            <div role="status" className="space-y-3 rounded-xl border border-border p-4 text-sm">
              <p>
                <span className="font-bold">{preview.valid}</span> صف صالح من أصل <span className="font-bold">{preview.total}</span>
              </p>
              {preview.errors.length > 0 && (
                <ul role="alert" className="max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-destructive">
                  {preview.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
              {preview.errors.length > 0 && <p className="text-muted-foreground">صحّح الأخطاء في الملف ثم أعد الرفع. لن يُستورد شيء قبل ذلك.</p>}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()} disabled={pending}>
              إغلاق
            </Button>
            <Button type="button" onClick={commit} disabled={!canCommit || pending}>
              {pending ? "جارٍ الاستيراد..." : `استيراد ${preview?.valid ?? 0} صفًا`}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
