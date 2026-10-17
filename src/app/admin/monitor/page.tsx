import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Video } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/types/firestore";

export const metadata: Metadata = { title: "مراقبة الامتحانات" };

export default function MonitorPage() {
  return (
    <>
      <PageHeader
        title="مراقبة الامتحانات"
        description="الطلاب الذين يؤدون امتحانًا الآن. البث مباشر فقط ولا يُحفظ."
        actions={<Link href="/admin/monitor/all" className={buttonVariants()}>عرض كل الكاميرات</Link>}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <MonitorList />
      </Suspense>
    </>
  );
}

async function MonitorList() {
  await connection();
  const db = getAdminDb();
  const active = await db.collection(COLLECTIONS.attempts).where("status", "==", "IN_PROGRESS").get();
  const rows = await Promise.all(
    active.docs.map(async (doc) => {
      const d = doc.data();
      const [user, exam] = await Promise.all([
        db.collection(COLLECTIONS.users).doc(d.studentId as string).get(),
        db.collection(COLLECTIONS.exams).doc(d.examId as string).get(),
      ]);
      return {
        id: doc.id,
        student: (user.data()?.displayName as string) || (user.data()?.email as string) || "طالب",
        exam: (exam.data()?.titleAr as string) || "امتحان",
      };
    }),
  );

  if (rows.length === 0) {
    return <EmptyState icon={Video} title="لا يوجد طلاب في امتحان الآن" description="عندما يبدأ طالب امتحانًا وتفعيل الكاميرا، سيظهر هنا." />;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`/admin/monitor/${row.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/40">
            <div className="min-w-0">
              <p className="truncate font-bold">{row.student}</p>
              <p className="truncate text-sm text-muted-foreground">{row.exam}</p>
            </div>
            <StatusBadge tone="success">يؤدي الآن</StatusBadge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
