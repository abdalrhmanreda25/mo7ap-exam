"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { inputClass } from "@/components/forms/styles";
import { reportResult } from "@/lib/client/result";
import { DEFAULT_GRADE, type GradeId } from "@/lib/grades";
import { createStudentAction } from "../actions";
import { GradeSelect } from "./student-manage";

/** Admin adds a student: name, email, password, and school year. */
export function AddStudentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState<GradeId>(DEFAULT_GRADE);
  const [pending, start] = useTransition();

  return (
    <details className="group rounded-2xl border border-border bg-card p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
        <UserPlus className="size-5" aria-hidden="true" />
        إضافة طالب
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const result = await createStudentAction({ displayName: name, email, password, grade });
            if (reportResult(result, "تمت إضافة الطالب.")) {
              setName("");
              setEmail("");
              setPassword("");
              router.refresh();
            }
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="new-student-name" label="الاسم">
            <input id="new-student-name" required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="new-student-grade" label="الصف" hint="الطالب يرى امتحانات صفه فقط.">
            <GradeSelect id="new-student-grade" value={grade} onChange={setGrade} />
          </Field>
          <Field id="new-student-email" label="البريد الإلكتروني" hint="يسجل به الطالب الدخول.">
            <input id="new-student-email" required dir="ltr" type="email" autoComplete="off" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="new-student-password" label="كلمة المرور" hint="6 أحرف على الأقل.">
            <input
              id="new-student-password"
              required
              minLength={6}
              dir="ltr"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "جارٍ الإضافة..." : "إضافة الطالب"}
        </Button>
      </form>
    </details>
  );
}
