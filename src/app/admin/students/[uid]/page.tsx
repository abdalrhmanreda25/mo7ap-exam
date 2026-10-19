import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStudent, getStudentStats, listStudentAttempts } from "@/features/students/service";
import { DeleteStudentButton, StudentEditForm } from "@/features/students/components/student-manage";
import { ActiveToggle, ReopenAttemptButton } from "@/features/students/components/student-actions";

export const metadata: Metadata = { title: "الطالب" };

export default function StudentPage({ params }: { params: Promise<{ uid: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <StudentContent params={params} />
    </Suspense>
  );
}

const STATUS_AR = { IN_PROGRESS: "جارٍ", SUBMITTED: "مُسلَّم", GRADED: "مُصحَّح" } as const;

async function StudentContent({ params }: { params: Promise<{ uid: string }> }) {
  await connection();
  const { uid } = await params;
  const db = getAdminDb();
  const student = await getStudent(db, uid);
  if (!student) notFound();
  const [attempts, stats] = await Promise.all([listStudentAttempts(db, uid), getStudentStats(db, uid)]);
  const current = attempts.filter((a) => !a.superseded);
  const history = attempts.filter((a) => a.superseded);

  return (
    <>
      <PageHeader
        title={student.displayName || student.email}
        description={student.email}
        actions={
          <>
            <StatusBadge tone={student.isActive ? "success" : "neutral"}>{student.isActive ? "نشط" : "موقوف"}</StatusBadge>
            <ActiveToggle uid={student.uid} isActive={student.isActive} />
          </>
        }
      />
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "امتحانات مكتملة", value: String(stats.completed) },
          { label: "متوسط الدرجات", value: stats.averagePercentage === null ? "—" : `${stats.averagePercentage}%` },
          { label: "أعلى / أقل", value: stats.bestPercentage === null ? "—" : `${stats.bestPercentage}% / ${stats.worstPercentage}%` },
          { label: "وقت الامتحانات", value: `${stats.totalMinutes} دقيقة` },
          { label: "إجابات صحيحة", value: String(stats.totalCorrect) },
          { label: "إجابات خاطئة", value: String(stats.totalWrong) },
          { label: "بدون إجابة", value: String(stats.totalBlank) },
          { label: "امتحانات جارية", value: String(stats.inProgress) },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{card.value}</p>
          </div>
        ))}
      </section>

      {stats.exams.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">تفاصيل كل امتحان</h2>
          <ul className="space-y-2">
            {stats.exams.map((e) => (
              <li key={e.attemptId} className="grid gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="font-bold">{e.examTitleAr}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.subjectNameAr}
                    {e.durationMinutes !== null && ` · ${e.durationMinutes} دقيقة`}
                    {e.fullscreenExits > 0 && ` · خرج من ملء الشاشة ${e.fullscreenExits} مرة`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm tabular-nums">
                  <span className="font-bold">{e.score} / {e.maxScore} ({e.percentage}%)</span>
                  <span className="text-success">✓ {e.correct}</span>
                  <span className="text-destructive">✗ {e.wrong}</span>
                  <span className="text-muted-foreground">— {e.blank}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.lessons.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">الأداء حسب الدرس</h2>
          <p className="text-sm text-muted-foreground">مرتبة من الأضعف إلى الأقوى.</p>
          <ul className="space-y-3">
            {stats.lessons.map((l) => (
              <li key={l.lessonId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{l.titleAr}</span>
                  <span className="tabular-nums text-muted-foreground">{l.correct} / {l.total} ({l.percentage}%)</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${l.percentage < 50 ? "bg-destructive" : l.percentage < 75 ? "bg-warning" : "bg-success"}`}
                    style={{ width: `${l.percentage}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.subjects.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">الأداء حسب المادة</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.subjects.map((sub) => (
              <li key={sub.subjectId} className="rounded-2xl border border-border bg-card p-4">
                <p className="font-bold">{sub.nameAr}</p>
                <p className="text-sm text-muted-foreground">{sub.exams} امتحان · متوسط {sub.averagePercentage}%</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">الامتحانات</h2>
        {current.length === 0 && <p className="text-sm text-muted-foreground">لم يبدأ أي امتحان بعد.</p>}
        <ul className="space-y-3">
          {current.map((a) => (
            <li key={a.attemptId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="min-w-0 space-y-1">
                <p className="font-bold">{a.examTitleAr}</p>
                <p className="text-sm text-muted-foreground">
                  {STATUS_AR[a.status]}
                  {a.score !== null && ` · ${a.score} / ${a.maxScore}`}
                  {a.fullscreenExits > 0 && ` · خرج من ملء الشاشة ${a.fullscreenExits} مرة`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.status === "IN_PROGRESS" && (
                  <Link href={`/admin/monitor/${a.attemptId}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
                    مشاهدة الكاميرا
                  </Link>
                )}
                <ReopenAttemptButton attemptId={a.attemptId} disabled={a.status === "IN_PROGRESS"} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      {history.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-bold">محاولات سابقة (محفوظة)</h2>
          <ul className="space-y-2">
            {history.map((a) => (
              <li key={a.attemptId} className="rounded-xl bg-muted/50 p-3 text-sm">
                {a.examTitleAr} · {a.score ?? "—"} / {a.maxScore}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-10 space-y-6">
        <StudentEditForm uid={student.uid} displayName={student.displayName} email={student.email} />
        <section className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="text-lg font-bold text-destructive">منطقة الخطر</h2>
          <p className="text-sm text-muted-foreground">
            {stats.inProgress > 0 ? "الطالب في امتحان الآن، لا يمكن حذفه حتى ينتهي." : "حذف الحساب يمنع الدخول نهائيًا. النتائج تبقى في السجل."}
          </p>
          <DeleteStudentButton uid={student.uid} disabled={stats.inProgress > 0} />
        </section>
      </div>
    </>
  );
}
