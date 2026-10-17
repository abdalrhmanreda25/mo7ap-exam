"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reportResult } from "@/lib/client/result";
import { startExamAction } from "../actions";

export function StartExamButton({ examId }: { examId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      className="h-12 w-full px-6 sm:w-auto"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startExamAction(examId);
          if (reportResult(result, "بدأ الامتحان.")) router.push(`/attempts/${result.data.attemptId}`);
        })
      }
    >
      {pending ? "جارٍ البدء..." : "ابدأ الامتحان"}
    </Button>
  );
}
