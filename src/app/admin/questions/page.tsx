import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Suspense } from "react";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { listSubjects } from "@/features/curriculum/service";
import { listQuestions, questionExamUsage } from "@/features/questions/service";
import { DIFFICULTY_AR, QUESTION_STATUS_AR, QUESTION_TYPE_AR } from "@/lib/labels";
import { QUESTION_STATUSES } from "@/types/firestore";
import { ImportDialog } from "@/features/import/components/import-dialog";
import { MixedText } from "@/components/feedback/mixed-text";

export const metadata: Metadata = { title: "بنك الأسئلة" };

export default function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string; status?: string }>;
}) {
  return (
    <>
      <PageHeader
        title="بنك الأسئلة"
        description="أسئلة قابلة لإعادة الاستخدام في عدة امتحانات. محتوى السؤال يُقفل بعد استخدامه في امتحان منشور."
        actions={
          <>
            <ImportDialog kind="questions" />
            <Link href="/admin/questions/new" className={buttonVariants()}>سؤال جديد</Link>
          </>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <QuestionsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function QuestionsContent({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string; status?: string }>;
}) {
  await connection();
  const { subjectId, status } = await searchParams;
  const db = getAdminDb();
  const statusFilter = QUESTION_STATUSES.find((s) => s === status);
  const [subjects, questions] = await Promise.all([
    listSubjects(db),
    listQuestions(db, { subjectId: subjectId || undefined, status: statusFilter }),
  ]);
  const subjectName = new Map(subjects.map((s) => [s.id, s.nameAr]));
  const usage = await Promise.all(questions.map((q) => questionExamUsage(db, q.id)));

  return (
    <div className="space-y-4">
      <form className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" method="get">
        <label className="space-y-1.5 text-sm font-medium">
          المادة
          <select name="subjectId" defaultValue={subjectId ?? ""} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-normal">
            <option value="">كل المواد</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          الحالة
          <select name="status" defaultValue={statusFilter ?? ""} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-normal">
            <option value="">كل الحالات</option>
            {QUESTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {QUESTION_STATUS_AR[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          تطبيق
        </button>
      </form>

      {questions.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="لا توجد أسئلة مطابقة"
          description="غيّر الفلاتر أو أضف سؤالًا جديدًا إلى البنك."
          action={<Link href="/admin/questions/new" className={buttonVariants()}>سؤال جديد</Link>}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {questions.map((q, index) => {
            const locked = usage[index].some((u) => u.examStatus !== "DRAFT");
            return (
              <li key={q.id}>
                <Link href={`/admin/questions/${q.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">
                      <MixedText text={q.statementAr || q.statement} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {subjectName.get(q.subjectId) ?? "—"} · {QUESTION_TYPE_AR[q.type]} · {DIFFICULTY_AR[q.difficulty]}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {locked && <StatusBadge tone="warning">مقفل</StatusBadge>}
                    <StatusBadge tone={q.status === "READY" ? "success" : q.status === "ARCHIVED" ? "neutral" : "primary"}>
                      {QUESTION_STATUS_AR[q.status]}
                    </StatusBadge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
