import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CheckCircle2, ClipboardList, Percent } from "lucide-react";
import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { listSubjects, listChapters } from "@/features/curriculum/service";
import { listPublishedExams } from "@/features/attempts/service";

export const metadata: Metadata = { title: "لوحة الطالب" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  await connection();
  const user = await requireRole("STUDENT");
  const db = getAdminDb();

  const [subjects, chapters, exams, resultsSnap] = await Promise.all([
    listSubjects(db),
    listChapters(db),
    listPublishedExams(db),
    db.collection("results").where("studentId", "==", user.uid).get(),
  ]);

  const activeSubjects = subjects.filter((s) => s.isActive);
  // Results replaced by a reopened exam stay in history but do not count toward current stats.
  const results = resultsSnap.docs
    .map((d) => d.data() as { percentage: number; examId: string; superseded?: boolean })
    .filter((r) => !r.superseded);
  const completed = results.length;
  const average = completed === 0 ? null : Math.round((results.reduce((sum, r) => sum + r.percentage, 0) / completed) * 100) / 100;
  const firstName = user.displayName.split(" ")[0] || "";

  const stats = [
    { label: "المواد", value: activeSubjects.length, icon: BookOpen },
    { label: "امتحانات متاحة", value: exams.length, icon: ClipboardList },
    { label: "امتحانات مكتملة", value: completed, icon: CheckCircle2 },
    { label: "متوسط الدرجات", value: average === null ? "—" : `${average}%`, icon: Percent },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title={`أهلًا${firstName ? ` ${firstName}` : ""}`}
        description="هذه لوحتك: المواد المتاحة، والامتحانات، ونتائجك."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <p className="mt-3 text-xs text-muted-foreground sm:text-sm">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">المواد</h2>
          <span className="text-sm text-muted-foreground">{activeSubjects.length} مادة</span>
        </div>
        {activeSubjects.length === 0 ? (
          <EmptyState icon={BookOpen} title="لا توجد مواد بعد" description="ستظهر المواد هنا عندما يضيفها المشرف." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeSubjects.map((subject) => {
              const chapterCount = chapters.filter((c) => c.subjectId === subject.id && c.isActive).length;
              return (
                <li key={subject.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold">{subject.nameAr}</h3>
                    <StatusBadge tone="neutral">{chapterCount} فصل</StatusBadge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{subject.curriculum}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">الامتحانات المتاحة</h2>
          <span className="text-sm text-muted-foreground">{exams.length} امتحان</span>
        </div>
        {exams.length === 0 ? (
          <EmptyState icon={ClipboardList} title="لا توجد امتحانات متاحة الآن" description="عند نشر امتحان جديد سيظهر هنا." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {exams.map((exam) => (
              <li key={exam.id}>
                <Link href={`/exams/${exam.id}`} className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40">
                  <h3 className="font-bold">{exam.titleAr}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {Math.round(exam.durationSeconds / 60)} دقيقة · {exam.questionCount} سؤال · {exam.maxScore} درجة
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
