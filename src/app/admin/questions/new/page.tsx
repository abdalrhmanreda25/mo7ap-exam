import { connection } from "next/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { listChapters, listLessons, listSubjects } from "@/features/curriculum/service";
import { QuestionForm } from "@/features/questions/components/question-form";

export const metadata: Metadata = { title: "سؤال جديد" };

export default function NewQuestionPage() {
  return (
    <>
      <PageHeader title="سؤال جديد" description="يُضاف السؤال إلى البنك. يُختار لاحقًا عند بناء امتحان." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <NewQuestionContent />
      </Suspense>
    </>
  );
}

async function NewQuestionContent() {
  await connection();
  const db = getAdminDb();
  const [subjects, chapters, lessons] = await Promise.all([listSubjects(db), listChapters(db), listLessons(db)]);
  const catalog = {
    subjects: subjects.filter((s) => s.isActive).map((s) => ({ id: s.id, nameAr: s.nameAr })),
    chapters: chapters.filter((c) => c.isActive).map((c) => ({ id: c.id, subjectId: c.subjectId, titleAr: c.titleAr })),
    lessons: lessons.filter((l) => l.isActive).map((l) => ({ id: l.id, chapterId: l.chapterId, subjectId: l.subjectId, titleAr: l.titleAr })),
  };
  return <QuestionForm catalog={catalog} />;
}
