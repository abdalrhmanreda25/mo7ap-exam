import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/roles";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "غير مصرح",
};

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh flex-1" />}>
      <UnauthorizedContent />
    </Suspense>
  );
}

async function UnauthorizedContent() {
  const user = await getSessionUser();
  const homeHref = user ? homePathFor(user.role) : "/login";

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">لا تملك صلاحية الوصول</h1>
          <p className="text-sm text-muted-foreground">
            هذه الصفحة غير متاحة لحسابك. إذا كنت تعتقد أن هذا خطأ، تواصل مع المشرف.
          </p>
        </div>
        <Link href={homeHref} className={buttonVariants({ className: "h-11 w-full" })}>
          {user ? "العودة إلى الصفحة الرئيسية" : "تسجيل الدخول"}
        </Link>
      </div>
    </main>
  );
}
