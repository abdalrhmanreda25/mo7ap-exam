import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = {
  title: "استعادة كلمة المرور",
};

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold text-foreground">استعادة كلمة المرور</h1>
        <p className="text-sm text-muted-foreground">أدخل بريدك لإرسال رابط إعادة التعيين.</p>
      </div>
      <ForgotPasswordForm />
      <div className="text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">
          العودة إلى تسجيل الدخول
        </Link>
      </div>
    </div>
  );
}
