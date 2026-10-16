import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardList, HelpCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/auth/session";
import { listSubjects } from "@/features/curriculum/service";
import { listExams } from "@/features/exams/service";
import { COLLECTIONS } from "@/types/firestore";

export const metadata: Metadata = { title: "لوحة المشرف" };

export default function AdminHomePage() {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full rounded-2xl" />}>
      <AdminHomeContent />
    </Suspense>
  );
}

async function AdminHomeContent() {
  await connection();
  const user = await requireRole("ADMIN");
  const db = getAdminDb();
  const [subjects, exams, questions] = await Promise.all([
    listSubjects(db),
    listExams(db),
    db.collection(COLLECTIONS.questions).count().get(),
  ]);
  const drafts = exams.filter((e) => e.status === "DRAFT").length;

  const stats = [
    { href: "/admin/subjects", label: "المواد", value: subjects.length, icon: BookOpen, note: "المنهج والفصول" },
    { href: "/admin/questions", label: "أسئلة البنك", value: questions.data().count, icon: HelpCircle, note: "قابلة لإعادة الاستخدام" },
    { href: "/admin/exams", label: "الامتحانات", value: exams.length, icon: ClipboardList, note: drafts ? `${drafts} مسودة بانتظار النشر` : "المنشورة والمسودات" },
  ];

  const steps = [
    { done: subjects.length > 0, label: "أضف مادة وفصلًا ودرسًا", href: "/admin/subjects/new" },
    { done: questions.data().count > 0, label: "أضف أسئلة جاهزة إلى البنك", href: "/admin/questions/new" },
    { done: exams.some((e) => e.status !== "DRAFT"), label: "أنشئ امتحانًا وانشره", href: "/admin/exams/new" },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title={`مرحبًا ${user.displayName || user.email}`}
        description="ابدأ ببناء المنهج، ثم أضف الأسئلة، ثم أنشئ الامتحان وانشره للطلاب."
      />

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {stats.map(({ href, label, value, icon: Icon, note }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:block sm:p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground sm:size-10">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 sm:mt-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold tabular-nums text-foreground sm:mt-1 sm:text-3xl">{value}</p>
              <p className="truncate text-xs text-muted-foreground">{note}</p>
            </div>
            <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-bold text-foreground">خطوات البداية</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.href}>
              <Link
                href={step.href}
                className="flex h-full items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <span
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.done ? <CheckCircle2 className="size-4" aria-label="مكتملة" /> : index + 1}
                </span>
                <span className="text-sm font-medium leading-relaxed text-foreground">{step.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
