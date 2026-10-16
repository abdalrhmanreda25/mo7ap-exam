import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { safeNextPath } from "@/lib/auth/roles";
import { LoginForm } from "@/features/auth/components/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold text-foreground">تسجيل الدخول</h1>
        <p className="text-sm text-muted-foreground">الحسابات تُنشأ بواسطة المشرف فقط.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <LoginFormSection searchParams={searchParams} />
      </Suspense>
      <div className="text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>
    </div>
  );
}

async function LoginFormSection({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm nextPath={safeNextPath(next)} />;
}
