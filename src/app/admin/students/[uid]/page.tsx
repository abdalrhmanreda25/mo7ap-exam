import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStudent, listStudentAttempts } from "@/features/students/service";
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
  const attempts = await listStudentAttempts(db, uid);
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
    </>
  );
}
