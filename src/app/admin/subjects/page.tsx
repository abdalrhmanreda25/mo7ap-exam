import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Suspense } from "react";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { listChapters, listSubjects } from "@/features/curriculum/service";
import { ImportDialog } from "@/features/import/components/import-dialog";

export const metadata: Metadata = { title: "المواد والمنهج" };

export default function SubjectsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <SubjectsContent />
    </Suspense>
  );
}

async function SubjectsContent() {
  await connection();
  const db = getAdminDb();
  const [subjects, chapters] = await Promise.all([listSubjects(db), listChapters(db)]);

  return (
    <>
      <PageHeader
        title="المواد والمنهج"
        description="المواد والفصول والدروس. تُدار هنا كبيانات، ولا توجد قائمة ثابتة في الكود."
        actions={
          <>
            <ImportDialog kind="subjects" />
            <Link href="/admin/subjects/new" className={buttonVariants()}>إضافة مادة</Link>
          </>
        }
      />
      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="لا توجد مواد بعد"
          description="أضف أول مادة، ثم فصولها ودروسها لبدء بناء المنهج."
          action={<Link href="/admin/subjects/new" className={buttonVariants()}>إضافة مادة</Link>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <Link href={`/admin/subjects/${subject.id}`} className="block space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold">{subject.nameAr}</h2>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {subject.slug}
                    </p>
                  </div>
                  <StatusBadge tone={subject.isActive ? "success" : "neutral"}>{subject.isActive ? "ظاهرة" : "مخفية"}</StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {subject.curriculum} · {subject.academicYear}
                  {subject.applicableTracks.length > 0 && ` · ${subject.applicableTracks.join("، ")}`}
                </p>
                <p className="text-xs text-muted-foreground">{chapters.filter((c) => c.subjectId === subject.id).length} فصل</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
