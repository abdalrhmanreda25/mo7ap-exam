import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Video } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/types/firestore";
import { CameraViewer } from "@/features/monitor/components/camera-viewer";

export const metadata: Metadata = { title: "كل الكاميرات" };

export default function MonitorAllPage() {
  return (
    <>
      <PageHeader
        title="كل الكاميرات"
        description="كل الطلاب الذين يؤدون امتحانًا الآن، في شاشة واحدة. بث مباشر فقط ولا يُحفظ."
        actions={<Link href="/admin/monitor" className="text-sm text-muted-foreground hover:text-foreground">عرض القائمة</Link>}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <Grid />
      </Suspense>
    </>
  );
}

async function Grid() {
  await connection();
  const db = getAdminDb();
  const active = await db.collection(COLLECTIONS.attempts).where("status", "==", "IN_PROGRESS").get();
  const rows = await Promise.all(
    active.docs.map(async (doc) => {
      const user = await db.collection(COLLECTIONS.users).doc(doc.data().studentId as string).get();
      return { id: doc.id, name: (user.data()?.displayName as string) || "طالب" };
    }),
  );
  if (rows.length === 0) {
    return <EmptyState icon={Video} title="لا يوجد طلاب في امتحان الآن" description="عندما يبدأ طالب امتحانًا ويُفعّل الكاميرا، سيظهر هنا." />;
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <li key={row.id} className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <p className="truncate font-bold">{row.name}</p>
          <CameraViewer attemptId={row.id} />
        </li>
      ))}
    </ul>
  );
}
