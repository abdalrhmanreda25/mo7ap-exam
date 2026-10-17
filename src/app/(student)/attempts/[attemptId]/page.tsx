import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAttemptView } from "@/features/attempts/service";
import { ExamPlayer } from "@/features/attempts/components/exam-player";

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
  return <ExamPlayer view={view} />;
}
