const ARABIC_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];

/**
 * Renders a question the way a student sees it. Bidi isolation keeps mixed Arabic and
 * English (and LTR notation such as x² or 2+2) readable inside RTL text.
 * When correctIndex is given (admin preview only), the correct option is marked.
 */
export function QuestionPreview({
  statementAr,
  statement,
  options,
  correctIndex,
  explanationAr,
}: {
  statementAr: string;
  statement: string;
  options: { id: string; textAr: string; text: string }[];
  correctIndex?: number | null;
  explanationAr?: string;
}) {
  const hasArabic = statementAr.trim().length > 0;
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5" dir="rtl" lang="ar">
      <p className="text-base font-medium leading-loose text-foreground">
        <bdi>{hasArabic ? statementAr : statement || "نص السؤال..."}</bdi>
      </p>
      <ol className="space-y-2">
        {options.map((option, index) => {
          const isCorrect = correctIndex === index;
          return (
            <li
              key={option.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                isCorrect ? "border-success/40 bg-success/5" : "border-border"
              }`}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {ARABIC_LETTERS[index] ?? index + 1}
              </span>
              <bdi className="flex-1">{option.textAr.trim() || option.text || "الخيار"}</bdi>
              {isCorrect && <span className="text-xs font-medium text-success">الإجابة الصحيحة</span>}
            </li>
          );
        })}
      </ol>
      {explanationAr && explanationAr.trim() && (
        <div className="rounded-xl bg-muted/60 p-4 text-sm leading-relaxed">
          <p className="mb-1 font-bold">الشرح</p>
          <bdi>{explanationAr}</bdi>
        </div>
      )}
    </div>
  );
}
