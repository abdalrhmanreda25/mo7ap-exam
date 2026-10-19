"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/feedback/confirm-action";
import { reportResult } from "@/lib/client/result";
import { cloneExamAction } from "../actions";

export function CloneExamButton({ examId }: { examId: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger="إنشاء نسخة للتعديل"
      title="إنشاء نسخة جديدة من الامتحان؟"
      description="تُنشأ مسودة بنفس الإعدادات والأسئلة، بأحدث محتوى من بنك الأسئلة (مثل الصور المضافة). الامتحان الحالي ونتائجه لا تتغير. بعد نشر النسخة الجديدة يمكنك إغلاق القديم."
      confirmLabel="إنشاء النسخة"
      variant="outline"
      onConfirm={async () => {
        const result = await cloneExamAction(examId);
        const message = result.ok && result.data.skipped ? `تم إنشاء النسخة. تُرك ${result.data.skipped} سؤال غير جاهز في البنك.` : "تم إنشاء النسخة.";
        if (reportResult(result, message)) router.push(`/admin/exams/${result.data.id}`);
      }}
    />
  );
}
