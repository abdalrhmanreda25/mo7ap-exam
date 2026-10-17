import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { listStudents } from "@/features/students/service";

export const metadata: Metadata = { title: "الطلاب" };

export default function StudentsPage() {
  return (
    <>
      <PageHeader title="الطلاب" description="كل الطلاب، وحالة الحساب، والامتحانات التي أدوها." />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <StudentsList />
      </Suspense>
    </>
  );
}

async function StudentsList() {
  await connection();
  const students = await listStudents(getAdminDb());
  if (students.length === 0) {
    return <EmptyState icon={Users} title="لا يوجد طلاب" description="أنشئ حساب طالب من سطر الأوامر الإداري." />;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {students.map((s) => (
        <li key={s.uid}>
          <Link href={`/admin/students/${s.uid}`} className="block space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{s.displayName || s.email}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">{s.email}</p>
              </div>
              <StatusBadge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "نشط" : "موقوف"}</StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              {s.completed} مكتمل · {s.inProgress} جارٍ
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
