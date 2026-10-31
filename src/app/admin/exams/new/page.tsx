import { connection } from "next/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { listSubjects } from "@/features/curriculum/service";
import { ExamConfigForm } from "@/features/exams/components/exam-config-form";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "امتحان جديد" };

export default function NewExamPage() {
  return (
    <>
      <PageHeader title="امتحان جديد" description="يُنشأ كمسودة. تضيف الأسئلة وتنشره من الصفحة التالية." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <NewExamContent />
      </Suspense>
    </>
  );
}

async function NewExamContent() {
  await connection();
  const { workspaceId } = await requireAdmin();
  const subjects = await listSubjects(getAdminDb(), workspaceId);
  return <ExamConfigForm subjects={subjects.filter((s) => s.isActive).map((s) => ({ id: s.id, nameAr: s.nameAr }))} />;
}
