import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AdminNav } from "@/components/layout/admin-nav";
import { requireRole } from "@/lib/auth/session";

/**
 * Admin shell. Every admin route is gated here and must still re-check
 * authorization in any privileged data access it performs.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh flex-1 bg-background" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background">
      <AppHeader user={user} homeHref="/admin" />
      <AdminNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
