import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAttemptView } from "@/features/attempts/service";
import { ExamPlayer } from "@/features/attempts/components/exam-player";
import { CameraGate } from "@/features/monitor/components/camera-gate";

export const metadata: Metadata = { title: "الامتحان" };

export default function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <AttemptContent params={params} />
    </Suspense>
  );
}

async function AttemptContent({ params }: { params: Promise<{ attemptId: string }> }) {
  await connection();
  const { attemptId } = await params;
  const user = await requireRole("STUDENT");
  const view = await getAttemptView(getAdminDb(), user.uid, attemptId);
  if (!view) notFound();

  // Camera is required only while the attempt is active. Results are shown without it.
  if (view.status !== "IN_PROGRESS") return <ExamPlayer view={view} />;
  return (
    <CameraGate attemptId={view.attemptId} studentId={user.uid}>
      <ExamPlayer view={view} />
    </CameraGate>
  );
}
