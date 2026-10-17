"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "الرئيسية" },
  { href: "/admin/subjects", label: "المواد والمنهج" },
  { href: "/admin/questions", label: "بنك الأسئلة" },
  { href: "/admin/exams", label: "الامتحانات" },
  { href: "/admin/monitor", label: "المراقبة" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="إدارة المحتوى" className="bg-card/60 border-b border-border/80">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-2 px-4 py-3 sm:flex sm:overflow-x-auto sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
