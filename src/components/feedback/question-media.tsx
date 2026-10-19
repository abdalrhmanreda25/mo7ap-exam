/**
 * Question figures (shapes, tables, diagrams). Accepts site paths (/figures/..., /api/media/...)
 * and https URLs. Rendered as plain img: sources are arbitrary and auth-protected, so next/image
 * optimization does not apply.
 */
export function QuestionMedia({ urls, alt = "شكل السؤال" }: { urls: string[]; alt?: string }) {
  const safe = urls.filter((u) => u.startsWith("/") || u.startsWith("https://"));
  if (safe.length === 0) return null;
  return (
    <div className="space-y-3">
      {safe.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={alt}
          loading="lazy"
          className="mx-auto max-h-[28rem] w-full rounded-xl border border-border bg-white object-contain p-2"
        />
      ))}
    </div>
  );
}
