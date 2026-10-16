import { connection } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { listSubjects } from "@/features/curriculum/service";
import { ExamComposer, type ComposedItem } from "@/features/exams/components/exam-composer";
import { ExamConfigForm } from "@/features/exams/components/exam-config-form";
import { readinessIssues } from "@/features/exams/composition";
import { getExam, getExamComposition, listAddableQuestions } from "@/features/exams/service";
import { EXAM_STATUS_AR, QUESTION_TYPE_AR } from "@/lib/labels";
import { ImportDialog } from "@/features/import/components/import-dialog";

export const metadata: Metadata = { title: "تفاصيل الامتحان" };

export default function ExamDetailPage({ params }: { params: Promise<{ examId: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <ExamDetailContent params={params} />
    </Suspense>
  );
}

async function ExamDetailContent({ params }: { params: Promise<{ examId: string }> }) {
  await connection();
  const { examId } = await params;
  const db = getAdminDb();
  const exam = await getExam(db, examId);
  if (!exam) notFound();

  const [composition, subjects] = await Promise.all([getExamComposition(db, examId), listSubjects(db)]);
  const issues = exam.status === "DRAFT" ? readinessIssues(composition, exam.durationSeconds, exam.maxScore) : [];
  const pool =
    exam.status === "DRAFT"
      ? await listAddableQuestions(db, exam.subjectId, composition.map((c) => c.questionId))
      : [];

  const items: ComposedItem[] = composition.map((c) => ({
    questionId: c.questionId,
    order: c.order,
    points: c.points,
    statementAr: c.statementAr,
    statement: c.bank?.statement ?? "",
    type: c.type ? QUESTION_TYPE_AR[c.type] : "",
    options: c.options.map((o) => ({ id: o.id, text: o.text, textAr: o.textAr })),
    hasKey: c.correctOptionId !== null,
  }));

  const tone = exam.status === "PUBLISHED" ? "success" : exam.status === "DRAFT" ? "primary" : "neutral";

  return (
    <>
      <PageHeader
        title={exam.titleAr}
        description={`${exam.questionCount} سؤال · ${exam.maxScore} درجة · ${Math.round(exam.durationSeconds / 60)} دقيقة`}
        actions={
          <>
            <StatusBadge tone={tone}>{EXAM_STATUS_AR[exam.status]}</StatusBadge>
            {exam.archived && <StatusBadge tone="neutral">مؤرشف</StatusBadge>}
          </>
        }
      />
      <div className="space-y-10">
        <section className="space-y-4">
          <h2 className="text-lg font-bold">إعدادات الامتحان</h2>
          <ExamConfigForm
            subjects={subjects.filter((s) => s.isActive || s.id === exam.subjectId).map((s) => ({ id: s.id, nameAr: s.nameAr }))}
            exam={exam}
            readOnly={exam.status !== "DRAFT"}
          />
        </section>
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">الأسئلة والنشر</h2>
            {exam.status === "DRAFT" && <ImportDialog kind="examQuestions" examId={exam.id} />}
          </div>
          <ExamComposer
            examId={exam.id}
            status={exam.status}
            archived={exam.archived}
            items={items}
            pool={pool.map((q) => ({ id: q.id, statementAr: q.statementAr, statement: q.statement, difficulty: q.difficulty }))}
            issues={issues}
          />
        </section>
      </div>
    </>
  );
}
