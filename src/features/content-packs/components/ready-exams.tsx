"use client";

import { PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/layout/page-header";
import { reportResult } from "@/lib/client/result";
import { importContentPackAction } from "../actions";

export interface ReadyExam {
  id: string;
  titleAr: string;
  questionCount: number;
  durationMinutes: number;
  added: boolean;
}

/** Exams shipped with the app. One click adds the chapter, questions, and a published exam with a code. */
export function ReadyExams({ packs }: { packs: ReadyExam[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});

  const add = (id: string) => {
    setRunning(id);
    startTransition(async () => {
      const result = await importContentPackAction(id);
      setRunning(null);
      const published = result.ok && result.data.status === "published" ? result.data : null;
      if (reportResult(result, published ? `تم نشر الامتحان. كود الدخول: ${published.accessCode}` : "الامتحان موجود بالفعل.")) {
        if (published) setCodes((current) => ({ ...current, [id]: published.accessCode }));
        router.refresh();
      }
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <PackagePlus className="size-5" aria-hidden="true" />
          امتحانات جاهزة
        </h2>
        <p className="text-sm text-muted-foreground">
          زر واحد يضيف الفصل والأسئلة وينشر الامتحان ويولّد كود الدخول. قد يستغرق دقيقة.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {packs.map((pack) => (
          <li key={pack.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4">
            <div className="space-y-1">
              <p className="font-medium leading-relaxed">{pack.titleAr}</p>
              <p className="text-xs text-muted-foreground">
                {pack.questionCount} سؤال · {pack.durationMinutes} دقيقة
              </p>
              {codes[pack.id] && (
                <p className="text-sm">
                  كود الدخول: <span dir="ltr" className="font-mono font-bold tracking-widest">{codes[pack.id]}</span>
                </p>
              )}
            </div>
            {pack.added ? (
              <StatusBadge tone="success">مضاف</StatusBadge>
            ) : (
              <Button type="button" disabled={pending} onClick={() => add(pack.id)}>
                {running === pack.id ? "جارٍ الإضافة..." : "إضافة ونشر"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
