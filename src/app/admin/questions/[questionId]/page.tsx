import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { listChapters, listLessons, listSubjects } from "@/features/curriculum/service";
import { getQuestionDetail } from "@/features/questions/service";
import { QuestionForm } from "@/features/questions/components/question-form";
import { EXAM_STATUS_AR } from "@/lib/labels";

export const metadata: Metadata = { title: "تعديل السؤال" };

export default function QuestionDetailPage({ params }: { params: Promise<{ questionId: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <QuestionDetailContent params={params} />
    </Suspense>
  );
}

async function QuestionDetailContent({ params }: { params: Promise<{ questionId: string }> }) {
  await connection();
  const { questionId } = await params;
  const db = getAdminDb();
  const [question, subjects, chapters, lessons] = await Promise.all([
    getQuestionDetail(db, questionId),
    listSubjects(db),
    listChapters(db),
    listLessons(db),
  ]);
  if (!question) notFound();

  const catalog = {
    subjects: subjects.map((s) => ({ id: s.id, nameAr: s.nameAr })),
    chapters: chapters.map((c) => ({ id: c.id, subjectId: c.subjectId, titleAr: c.titleAr })),
    lessons: lessons.map((l) => ({ id: l.id, chapterId: l.chapterId, subjectId: l.subjectId, titleAr: l.titleAr })),
  };
  const usedIn = [...new Set(question.lockedBy.map((u) => EXAM_STATUS_AR[u.examStatus as keyof typeof EXAM_STATUS_AR] ?? u.examStatus))];

  return (
    <>
      <PageHeader
        title="تعديل السؤال"
        description={usedIn.length ? `مستخدم في امتحانات: ${usedIn.join("، ")}` : "لم يُستخدم في أي امتحان منشور بعد."}
        actions={question.locked ? <StatusBadge tone="warning">محتوى مقفل</StatusBadge> : undefined}
      />
      <QuestionForm catalog={catalog} question={question} />
    </>
  );
}
