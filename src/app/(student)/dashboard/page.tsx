import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "لوحة الطالب",
};

/**
 * Phase 1 placeholder. Real dashboard widgets (subjects, results, analytics)
 * arrive in Phase 5 once the data layer exists. No fake statistics here.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const user = await requireRole("STUDENT");
  const firstName = user.displayName.split(" ")[0] || "";

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-bold text-foreground">
        أهلًا{firstName ? ` ${firstName}` : ""}
      </h1>
      <p className="text-muted-foreground">تم تسجيل دخولك بنجاح. الامتحانات ستظهر هنا قريبًا.</p>
    </section>
  );
}
