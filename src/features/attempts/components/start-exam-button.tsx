"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/forms/styles";
import { reportResult } from "@/lib/client/result";
import { startExamAction } from "../actions";

/** The student types the code the admin generated for this exam, then starts. */
export function StartExamButton({ examId }: { examId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  return (
    <form
      className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await startExamAction(examId, code);
          if (reportResult(result, "بدأ الامتحان.")) router.push(`/attempts/${result.data.attemptId}`);
        });
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="access-code" className="text-sm font-medium">
          كود الامتحان
        </label>
        <input
          id="access-code"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          required
          placeholder="ABC123"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          className={`${inputClass} h-12 text-center font-mono text-lg tracking-[0.3em] sm:h-12 sm:w-44 sm:text-lg`}
        />
      </div>
      <Button type="submit" className="h-12 w-full px-6 sm:w-auto" disabled={pending || code.trim() === ""}>
        {pending ? "جارٍ البدء..." : "ابدأ الامتحان"}
      </Button>
    </form>
  );
}
