"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sendPasswordResetEmail } from "firebase/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClientAuth } from "@/lib/firebase/client";
import { authErrorMessage } from "../errors";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";

/**
 * Always shows the same confirmation, whether or not the account exists.
 * This prevents account enumeration.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    try {
      await sendPasswordResetEmail(getClientAuth(), values.email);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      // Non-network failures still show the neutral confirmation to avoid leaking account state.
      if (code === "auth/network-request-failed" || code === "auth/too-many-requests") {
        const message = authErrorMessage(error);
        toast.error(message);
        return;
      }
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div role="status" className="space-y-4 text-sm text-muted-foreground">
        <p>إذا كان البريد مسجلًا، ستصلك رسالة تحتوي على رابط تعيين كلمة المرور.</p>
        <Link href="/login" className="font-medium text-primary hover:underline">
          العودة إلى تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="reset-email">البريد الإلكتروني</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          dir="ltr"
          className="text-start"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "reset-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p id="reset-email-error" role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
      </Button>
    </form>
  );
}
