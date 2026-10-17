"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReasonConfirm } from "@/components/feedback/reason-confirm";
import { reportResult } from "@/lib/client/result";
import { reopenAttemptAction, reopenExamForAllAction, setStudentActiveAction } from "../actions";

export function ReopenAttemptButton({ attemptId, disabled }: { attemptId: string; disabled: boolean }) {
  const router = useRouter();
  return (
    <ReasonConfirm
      trigger="إعادة فتح الامتحان"
      title="السماح للطالب بإعادة الامتحان؟"
      description="تُنقل المحاولة الحالية ونتيجتها إلى السجل ولا تُحذف، ثم يستطيع الطالب البدء من جديد."
      confirmLabel="إعادة الفتح"
      disabled={disabled}
      onConfirm={async (reason) => {
        const ok = reportResult(await reopenAttemptAction(attemptId, reason), "تم فتح الامتحان للطالب من جديد.");
        if (ok) router.refresh();
        return ok;
      }}
    />
  );
}

export function ReopenAllButton({ examId }: { examId: string }) {
  const router = useRouter();
  return (
    <ReasonConfirm
      trigger="إعادة فتح الامتحان لكل الطلاب"
      title="إعادة الامتحان لكل الطلاب؟"
      description="كل محاولة منتهية تُنقل مع نتيجتها إلى السجل، ويستطيع كل طالب البدء من جديد. المحاولات الجارية لا تتأثر."
      confirmLabel="إعادة الفتح للجميع"
      onConfirm={async (reason) => {
        const result = await reopenExamForAllAction(examId, reason);
        const ok = reportResult(
          result,
          result.ok
            ? `تمت إعادة الفتح لـ ${result.data.reopened} طالب${result.data.skipped ? `، وتُركت ${result.data.skipped} محاولة جارية` : ""}.`
            : "",
        );
        if (ok && result.ok && result.data.closed) {
          // Reopened attempts cannot start while the exam is closed.
          toast.warning("الامتحان مغلق، لذلك لن يستطيع الطلاب بدءه من جديد.");
        }
        if (ok) router.refresh();
        return ok;
      }}
    />
  );
}

export function ActiveToggle({ uid, isActive }: { uid: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={isActive ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (reportResult(await setStudentActiveAction(uid, !isActive), isActive ? "تم إيقاف الحساب." : "تم تفعيل الحساب.")) router.refresh();
        })
      }
    >
      {pending ? "جارٍ الحفظ..." : isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
    </Button>
  );
}
