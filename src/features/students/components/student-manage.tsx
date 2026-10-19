"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/feedback/confirm-action";
import { Field, FormSection } from "@/components/forms/field";
import { inputClass } from "@/components/forms/styles";
import { reportResult } from "@/lib/client/result";
import { deleteStudentAction, studentPasswordLinkAction, updateStudentAction } from "../actions";

export function StudentEditForm({ uid, displayName, email }: { uid: string; displayName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [mail, setMail] = useState(email);
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  return (
    <FormSection title="بيانات الحساب" description="تغيير كلمة المرور يُخرج الطالب من كل الأجهزة.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="student-name" label="الاسم">
          <input id="student-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="student-email" label="البريد الإلكتروني">
          <input id="student-email" dir="ltr" type="email" className={inputClass} value={mail} onChange={(e) => setMail(e.target.value)} />
        </Field>
        <Field id="student-password" label="كلمة مرور جديدة (اختياري)" hint="اتركها فارغة لعدم التغيير. 6 أحرف على الأقل.">
          <input
            id="student-password"
            dir="ltr"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const ok = reportResult(
                await updateStudentAction(uid, { displayName: name, email: mail, password: password || undefined }),
                "تم حفظ بيانات الطالب.",
              );
              if (ok) {
                setPassword("");
                router.refresh();
              }
            })
          }
        >
          {pending ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await studentPasswordLinkAction(uid);
              if (result.ok) setLink(result.data.link);
              else toast.error(result.message);
            })
          }
        >
          رابط تعيين كلمة مرور
        </Button>
      </div>
      {link && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-xs">
          <p>رابط صالح لمرة واحدة. أرسله للطالب بشكل خاص.</p>
          <p dir="ltr" className="break-all font-mono">{link}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              toast.success("تم نسخ الرابط.");
            }}
          >
            نسخ الرابط
          </Button>
        </div>
      )}
    </FormSection>
  );
}

export function DeleteStudentButton({ uid, disabled }: { uid: string; disabled: boolean }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger="حذف الطالب"
      title="حذف حساب الطالب نهائيًا؟"
      description="يُحذف حساب الدخول والملف الشخصي. محاولاته ونتائجه تبقى محفوظة في السجل. لا يمكن التراجع."
      confirmLabel="حذف نهائيًا"
      variant="destructive"
      disabled={disabled}
      onConfirm={async () => {
        if (reportResult(await deleteStudentAction(uid), "تم حذف الطالب.")) router.push("/admin/students");
      }}
    />
  );
}
