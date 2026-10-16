import { GraduationCap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-primary/5" />
      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <GraduationCap className="size-7" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight text-foreground">mo7ap exam</p>
            <p className="text-sm text-muted-foreground">منصة امتحانات الثانوية العامة</p>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 shadow-lg shadow-primary/5 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
