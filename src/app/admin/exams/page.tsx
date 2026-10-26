import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Suspense } from "react";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { listSubjects } from "@/features/curriculum/service";
import { listExams } from "@/features/exams/service";
import { EXAM_STATUS_AR } from "@/lib/labels";
import { CONTENT_PACKS } from "@/features/content-packs/packs";
import { ReadyExams } from "@/features/content-packs/components/ready-exams";

export const metadata: Metadata = { title: "الامتحانات" };

// Adding a ready exam writes dozens of questions in one server action.
export const maxDuration = 300;

export default function ExamsPage() {
  return (
    <>
      <PageHeader
        title="الامتحانات"
        description="المسودات تُبنى وتُراجع، والمنشور يُقفل ويصبح مرجعًا للنتائج."
        actions={<Link href="/admin/exams/new" className={buttonVariants()}>امتحان جديد</Link>}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <ExamsContent />
      </Suspense>
    </>
  );
}

async function ExamsContent() {
  await connection();
  const db = getAdminDb();
  const [exams, subjects] = await Promise.all([listExams(db), listSubjects(db)]);
  const subjectName = new Map(subjects.map((s) => [s.id, s.nameAr]));
  const visible = exams.filter((e) => !e.archived);
  const archived = exams.filter((e) => e.archived);
  const titles = new Set(exams.map((e) => e.titleAr));
  const ready = (
    <ReadyExams
      packs={CONTENT_PACKS.map(({ id, pack }) => ({
        id,
        titleAr: pack.exam.titleAr,
        questionCount: pack.questions.length,
        durationMinutes: pack.exam.durationMinutes,
        added: titles.has(pack.exam.titleAr),
      }))}
    />
  );

  if (exams.length === 0) {
    return (
      <div className="space-y-8">
        {ready}
        <EmptyState
        icon={ClipboardList}
        title="لا توجد امتحانات بعد"
        description="ابدأ بمسودة امتحان، ثم أضف الأسئلة من البنك وانشره عندما يكتمل."
        action={<Link href="/admin/exams/new" className={buttonVariants()}>امتحان جديد</Link>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {ready}
      <ExamList exams={visible} subjectName={subjectName} />
      {archived.length > 0 && (
        <details className="space-y-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">المؤرشفة ({archived.length})</summary>
          <ExamList exams={archived} subjectName={subjectName} />
        </details>
      )}
    </div>
  );
}

function ExamList({ exams, subjectName }: { exams: Awaited<ReturnType<typeof listExams>>; subjectName: Map<string, string> }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {exams.map((exam) => (
        <li key={exam.id}>
          <Link href={`/admin/exams/${exam.id}`} className="block space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold">{exam.titleAr}</h2>
              <StatusBadge tone={exam.status === "PUBLISHED" ? "success" : exam.status === "DRAFT" ? "primary" : "neutral"}>
                {EXAM_STATUS_AR[exam.status]}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              {subjectName.get(exam.subjectId) ?? "—"} · {Math.round(exam.durationSeconds / 60)} دقيقة · {exam.questionCount} سؤال · {exam.maxScore} درجة
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
