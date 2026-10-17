"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/feedback/confirm-action";
import { reportResult } from "@/lib/client/result";
import { deleteExamAction } from "../actions";

export function DeleteExamButton({ examId, disabled }: { examId: string; disabled: boolean }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger="حذف الامتحان"
      title="حذف الامتحان نهائيًا؟"
      description={
        disabled
          ? "لا يمكن حذف امتحان بدأه طلاب، لأن المحاولات والنتائج سجل دائم. استخدم الأرشفة."
          : "سيُحذف الامتحان وأسئلته ومفاتيح إجاباته. لا يمكن التراجع. أسئلة البنك تبقى محفوظة."
      }
      confirmLabel="حذف نهائيًا"
      variant="destructive"
      disabled={disabled}
      onConfirm={async () => {
        const result = await deleteExamAction(examId);
        if (reportResult(result, "تم حذف الامتحان.")) router.push("/admin/exams");
      }}
    />
  );
}
