"use client";

import { Copy, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/feedback/confirm-action";
import { reportResult } from "@/lib/client/result";
import { generateAccessCodeAction } from "../actions";

/** Shows the exam's access code and lets the admin generate or replace it. */
export function AccessCodePanel({ examId, code }: { examId: string; code: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const generate = async () => {
    const result = await generateAccessCodeAction(examId);
    if (reportResult(result, `الكود الجديد: ${result.ok ? result.data.code : ""}`)) router.refresh();
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <KeyRound className="size-5" aria-hidden="true" />
          كود الدخول
        </h2>
        <p className="text-sm text-muted-foreground">
          الطالب يكتب هذا الكود ليبدأ الامتحان. الكود الجديد يُلغي القديم، ومن بدأ الامتحان يكمل بدون كود.
        </p>
      </div>
      {code ? (
        <div className="flex flex-wrap items-center gap-3">
          <output dir="ltr" className="rounded-xl border border-border bg-muted px-5 py-3 font-mono text-2xl font-bold tracking-[0.3em]" aria-label="كود الامتحان">
            {code}
          </output>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                toast.success("تم نسخ الكود.");
              } catch {
                toast.error("تعذر النسخ. انسخ الكود يدويًا.");
              }
            }}
          >
            <Copy className="size-4" aria-hidden="true" />
            نسخ الكود
          </Button>
          <ConfirmAction
            trigger="توليد كود جديد"
            title="توليد كود جديد؟"
            description="الكود الحالي يتوقف عن العمل فورًا. الطالب الذي بدأ الامتحان بالفعل يكمل بدون مشكلة."
            confirmLabel="توليد"
            variant="outline"
            onConfirm={generate}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-destructive">لا يوجد كود بعد. الطلاب لا يستطيعون بدء الامتحان حتى تولّد كودًا.</p>
          <Button type="button" disabled={pending} onClick={() => startTransition(generate)}>
            {pending ? "جارٍ التوليد..." : "توليد كود"}
          </Button>
        </div>
      )}
    </section>
  );
}
