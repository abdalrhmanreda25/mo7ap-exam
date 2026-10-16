import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { requireRole } from "@/lib/auth/session";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh flex-1 bg-background" />}>
      <StudentShell>{children}</StudentShell>
    </Suspense>
  );
}

async function StudentShell({ children }: { children: React.ReactNode }) {
  const user = await requireRole("STUDENT");

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background">
      <AppHeader user={user} homeHref="/dashboard" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
