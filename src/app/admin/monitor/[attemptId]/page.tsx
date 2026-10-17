import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/types/firestore";
import { CameraViewer } from "@/features/monitor/components/camera-viewer";

export const metadata: Metadata = { title: "مراقبة الطالب" };

export default function MonitorAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <MonitorAttemptContent params={params} />
    </Suspense>
  );
}

async function MonitorAttemptContent({ params }: { params: Promise<{ attemptId: string }> }) {
  await connection();
  const { attemptId } = await params;
  const db = getAdminDb();
  const attempt = await db.collection(COLLECTIONS.attempts).doc(attemptId).get();
  if (!attempt.exists) notFound();
  const [user, exam] = await Promise.all([
    db.collection(COLLECTIONS.users).doc(attempt.data()!.studentId as string).get(),
    db.collection(COLLECTIONS.exams).doc(attempt.data()!.examId as string).get(),
  ]);
  return (
    <>
      <PageHeader
        title={(user.data()?.displayName as string) || "طالب"}
        description={`${(exam.data()?.titleAr as string) || "امتحان"} · ${attempt.data()!.status === "IN_PROGRESS" ? "يؤدي الامتحان الآن" : "انتهى"}`}
      />
      <div className="mx-auto max-w-3xl">
        <CameraViewer attemptId={attemptId} />
      </div>
    </>
  );
}
