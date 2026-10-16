import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { ROLE_LABELS_AR } from "@/lib/auth/role-labels";
import type { SessionUser } from "@/lib/auth/session";

function initialsOf(name: string, fallback: string) {
  const source = name.trim() || fallback;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function AppHeader({ user, homeHref }: { user: SessionUser; homeHref: string }) {
  const name = user.displayName || user.email || "";
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href={homeHref} className="flex items-center gap-2.5 rounded-lg font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="size-5" aria-hidden="true" />
          </span>
          <span className="tracking-tight">mo7ap exam</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground"
            >
              {initialsOf(name, user.email ?? "")}
            </span>
            <div className="hidden text-end sm:block">
              <p className="text-sm font-semibold leading-tight text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS_AR[user.role]}</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
