import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader, StatusBadge } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAttemptIdState, getExamForStudent } from "@/features/attempts/service";
import { StartExamButton } from "@/features/attempts/components/start-exam-button";

export const metadata: Metadata = { title: "تفاصيل الامتحان" };

export default function ExamInstructionsPage({ params }: { params: Promise<{ examId: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <ExamInstructionsContent params={params} />
    </Suspense>
  );
}

async function ExamInstructionsContent({ params }: { params: Promise<{ examId: string }> }) {
  await connection();
  const { examId } = await params;
  const user = await requireRole("STUDENT");
  const db = getAdminDb();
  const exam = await getExamForStudent(db, examId);
  if (!exam) notFound();
  const attempt = await getAttemptIdState(db, user.uid, examId);

  const minutes = Math.round(exam.durationSeconds / 60);
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title={exam.titleAr} description={exam.description || undefined} />

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: "المدة", value: `${minutes} دقيقة` },
          { label: "الأسئلة", value: String(exam.questionCount) },
          { label: "الدرجة", value: String(exam.maxScore) },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 font-bold tabular-nums">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
        <h2 className="font-bold">قبل أن تبدأ</h2>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>يبدأ المؤقت عند الضغط على «ابدأ الامتحان» ولا يتوقف عند إغلاق الصفحة.</li>
          <li>يُحفظ كل اختيار تلقائيًا. الوقت يحسبه الخادم، وليس المتصفح.</li>
          <li>لا يمكن بدء الامتحان مرة ثانية. يمكنك متابعته إذا أغلقت الصفحة.</li>
          <li>عند انتهاء الوقت يُسلَّم الامتحان تلقائيًا بالإجابات المحفوظة.</li>
        </ul>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!attempt && <StartExamButton examId={exam.id} />}
        {attempt?.status === "IN_PROGRESS" && (
          <Link href={`/attempts/${attempt.attemptId}`} className={buttonVariants({ size: "lg", className: "h-12 w-full sm:w-auto" })}>
            متابعة الامتحان
          </Link>
        )}
        {attempt && attempt.status !== "IN_PROGRESS" && (
          <>
            <StatusBadge tone="success">تم التسليم</StatusBadge>
            <Link href={`/attempts/${attempt.attemptId}`} className={buttonVariants({ variant: "outline", className: "h-12 w-full sm:w-auto" })}>
              عرض النتيجة
            </Link>
          </>
        )}
        <Link href="/dashboard" className="text-center text-sm text-muted-foreground hover:text-foreground sm:text-start">
          العودة إلى الرئيسية
        </Link>
      </div>
    </div>
  );
}
