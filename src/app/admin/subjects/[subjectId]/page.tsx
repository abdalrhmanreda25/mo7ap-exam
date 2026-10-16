import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { CurriculumManager } from "@/features/curriculum/components/curriculum-manager";
import { SubjectForm } from "@/features/curriculum/components/subject-form";
import { getSubject, listChapters, listLessons } from "@/features/curriculum/service";
import { ImportDialog } from "@/features/import/components/import-dialog";

export const metadata: Metadata = { title: "تفاصيل المادة" };

export default function SubjectDetailPage({ params }: { params: Promise<{ subjectId: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <SubjectDetailContent params={params} />
    </Suspense>
  );
}

async function SubjectDetailContent({ params }: { params: Promise<{ subjectId: string }> }) {
  await connection();
  const { subjectId } = await params;
  const db = getAdminDb();
  const subject = await getSubject(db, subjectId);
  if (!subject) notFound();

  const [chapters, lessons] = await Promise.all([listChapters(db, subjectId), listLessons(db)]);
  const subjectLessons = lessons.filter((lesson) => lesson.subjectId === subjectId);

  return (
    <>
      <PageHeader
        title={subject.nameAr}
        description={`${subject.curriculum} · ${subject.academicYear}`}
        actions={<StatusBadge tone={subject.isActive ? "success" : "neutral"}>{subject.isActive ? "ظاهرة للطلاب" : "مخفية"}</StatusBadge>}
      />
      <div className="space-y-10">
        <section className="space-y-4">
          <h2 className="text-lg font-bold">بيانات المادة</h2>
          <SubjectForm subject={subject} />
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-bold">الفصول والدروس</h2>
          <p className="text-sm text-muted-foreground">
            لإخفاء فصل أو درس، ألغِ تحديد «ظاهر» بدلًا من حذفه. الأسئلة المرتبطة به تبقى محفوظة.
          </p>
          <div className="flex flex-wrap gap-2">
            <ImportDialog kind="chapters" />
            <ImportDialog kind="lessons" />
          </div>
          <CurriculumManager subjectId={subjectId} chapters={chapters} lessons={subjectLessons} />
        </section>
      </div>
    </>
  );
}
