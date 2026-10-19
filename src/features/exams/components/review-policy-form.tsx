"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/forms/field";
import { reportResult } from "@/lib/client/result";
import { updateReviewPolicyAction } from "../actions";
import type { ReviewPolicy } from "../service";

/** Editable on published and closed exams. Does not affect questions or grading. */
export function ReviewPolicyForm({ examId, initial }: { examId: string; initial: ReviewPolicy }) {
  const router = useRouter();
  const [policy, setPolicy] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(policy) !== JSON.stringify(initial);
  const toggle = (key: keyof ReviewPolicy) => setPolicy((p) => ({ ...p, [key]: !p[key] }));

  return (
    <FormSection title="ما يراه الطالب بعد التسليم" description="يمكن تغييره بعد النشر. لا يغيّر الأسئلة ولا الدرجات، ويُطبَّق على كل النتائج عند عرضها.">
      <div className="grid gap-3">
        {(
          [
            ["showScoreAfterSubmit", "إظهار الدرجة"],
            ["showCorrectAnswersAfterSubmit", "إظهار الإجابات الصحيحة"],
            ["showExplanationsAfterSubmit", "إظهار الشروح"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={policy[key]} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
      </div>
      <Button
        type="button"
        disabled={!dirty || pending}
        onClick={() =>
          start(async () => {
            if (reportResult(await updateReviewPolicyAction(examId, policy), "تم حفظ ما يراه الطالب.")) router.refresh();
          })
        }
      >
        {pending ? "جارٍ الحفظ..." : "حفظ"}
      </Button>
    </FormSection>
  );
}
