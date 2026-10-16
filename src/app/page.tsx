import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home",
  description: "Personal website",
};

const LINKS = [
  { label: "GitHub", href: "https://github.com/abdalrhmanreda25" },
  { label: "Email", href: "mailto:you@example.com" },
];

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl space-y-10">
        <header className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground">Hello, I am</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Your Name</h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            A short bio goes here. Replace this with a sentence about what you do and what you care about.
          </p>
        </header>

        <nav aria-label="Links" className="flex flex-wrap gap-3">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </footer>
      </div>
    </main>
  );
}
