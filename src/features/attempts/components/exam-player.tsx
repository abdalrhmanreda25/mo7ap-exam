"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, CloudOff, Loader2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/feedback/confirm-action";
import { Button } from "@/components/ui/button";
import { QuestionPreview } from "@/features/questions/components/question-preview";
import { reportResult } from "@/lib/client/result";
import { saveAnswerAction, submitAttemptAction } from "../actions";
import { formatRemaining } from "../time";
import type { AttemptView } from "../service";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Exam UI. The timer is informational: it counts down from the server deadline, corrected by the
 * clock offset measured at load. The server is authoritative and rejects saves after the deadline.
 */
export function ExamPlayer({ view }: { view: AttemptView }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>(view.answers);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  // Server and client render the same first frame. The real clock starts after mount.
  const [online, setOnline] = useState(true);
  const [clock, setClock] = useState(() => view.serverNowMs);
  const offsetRef = useRef(0);
  const [pending, startTransition] = useTransition();
  const seqRef = useRef(0);
  const latestSeqRef = useRef<Record<string, number>>({});
  const refreshedRef = useRef(false);

  const finished = view.status !== "IN_PROGRESS";
  const remainingMs = view.deadlineMs - clock;
  const expired = !finished && remainingMs <= 0;
  const locked = finished || expired;
  const total = view.questions.length;
  const current = view.questions[index];
  const answeredCount = Object.keys(selected).length;

  useEffect(() => {
    // Offset between server and device clocks, measured once after mount (not during render).
    offsetRef.current = view.serverNowMs - Date.now();
    const tick = setInterval(() => {
      setClock(Date.now() + offsetRef.current);
      setOnline(navigator.onLine);
    }, 1000);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [view.serverNowMs]);

  // When time runs out, ask the server to finalize from saved answers. Runs once.
  useEffect(() => {
    if (expired && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [expired, router]);

  const save = async (questionId: string, optionId: string) => {
    const seq = ++seqRef.current;
    latestSeqRef.current[questionId] = seq;
    setSaveState((s) => ({ ...s, [questionId]: "saving" }));
    const result = await saveAnswerAction(view.attemptId, questionId, optionId, seq);
    // A newer selection for this question superseded this request. Let it decide the status.
    if (latestSeqRef.current[questionId] !== seq) return;
    if (result.ok) {
      setSaveState((s) => ({ ...s, [questionId]: "saved" }));
      return;
    }
    setSaveState((s) => ({ ...s, [questionId]: "error" }));
    toast.error(result.message);
    if (result.message.includes("انتهى") || result.message.includes("منتهية")) router.refresh();
  };

  const choose = (questionId: string, optionId: string) => {
    if (locked) return;
    setSelected((s) => ({ ...s, [questionId]: optionId }));
    void save(questionId, optionId);
  };

  const submit = () =>
    startTransition(async () => {
      const result = await submitAttemptAction(view.attemptId);
      if (reportResult(result, "تم تسليم الامتحان.")) router.refresh();
      else router.refresh();
    });

  const timerTone =
    remainingMs <= 60_000 ? "text-destructive" : remainingMs <= 5 * 60_000 ? "text-warning" : "text-foreground";

  const unansweredCount = total - answeredCount;
  const saveLabel = current
    ? { idle: "", saving: "جارٍ الحفظ...", saved: "تم الحفظ", error: "لم يُحفظ. اختر الإجابة مرة أخرى." }[saveState[current.examQuestionId] ?? "idle"]
    : "";

  if (finished || expired) {
    return <ResultPanel view={view} expired={expired && !finished} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="sticky top-16 z-20 -mx-4 space-y-3 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{view.examTitleAr}</p>
            <p className="text-xs text-muted-foreground">
              {answeredCount} من {total} مُجاب
            </p>
          </div>
          <div
            role="timer"
            aria-live="off"
            aria-label={`الوقت المتبقي ${formatRemaining(remainingMs)}`}
            className={`flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 font-mono text-lg font-bold tabular-nums ${timerTone}`}
          >
            <Clock className="size-4" aria-hidden="true" />
            {formatRemaining(remainingMs)}
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} />
        </div>
        {!online && (
          <p role="alert" className="flex items-center gap-2 text-xs text-warning">
            <WifiOff className="size-3.5" aria-hidden="true" /> لا يوجد اتصال. الاختيارات تُحفظ عند عودة الاتصال.
          </p>
        )}
      </header>

      {current && (
        <section aria-labelledby="question-title" className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <h2 id="question-title" className="font-bold text-foreground">
              السؤال {index + 1} من {total}
            </h2>
            <span>{current.points} درجة</span>
          </div>
          <QuestionPreview
            statementAr={current.statementAr}
            statement={current.statement}
            options={current.options}
            correctIndex={null}
          />
          <fieldset className="space-y-2">
            <legend className="sr-only">اختر الإجابة</legend>
            {current.options.map((option, optionIndex) => {
              const isOn = selected[current.examQuestionId] === option.id;
              return (
                <label
                  key={option.id}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                    isOn ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/50"
                  } ${locked ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <input
                    type="radio"
                    name={`q-${current.examQuestionId}`}
                    value={option.id}
                    checked={isOn}
                    disabled={locked}
                    onChange={() => choose(current.examQuestionId, option.id)}
                    className="size-5 accent-primary"
                  />
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {"أبجدهوز"[optionIndex] ?? optionIndex + 1}
                  </span>
                  <bdi className="flex-1">{option.textAr.trim() || option.text}</bdi>
                </label>
              );
            })}
          </fieldset>
          <p aria-live="polite" className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
            {saveState[current.examQuestionId] === "saving" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {saveState[current.examQuestionId] === "saved" && <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />}
            {saveState[current.examQuestionId] === "error" && <CloudOff className="size-3.5 text-destructive" aria-hidden="true" />}
            {saveLabel}
          </p>
        </section>
      )}

      <nav aria-label="أرقام الأسئلة" className="grid grid-cols-8 gap-2 sm:grid-cols-10">
        {view.questions.map((q, i) => {
          const answered = Boolean(selected[q.examQuestionId]);
          return (
            <button
              key={q.examQuestionId}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={`السؤال ${i + 1}${answered ? "، مُجاب" : "، غير مُجاب"}`}
              className={`flex aspect-square items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                i === index
                  ? "bg-foreground text-background"
                  : answered
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button type="button" variant="outline" className="h-12 px-4" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          <ChevronRight className="size-4" aria-hidden="true" />
          السابق
        </Button>
        {index < total - 1 ? (
          <Button type="button" className="h-12 px-4" onClick={() => setIndex((i) => i + 1)}>
            التالي
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <ConfirmAction
            trigger="تسليم الامتحان"
            title="تسليم الامتحان؟"
            description={
              unansweredCount > 0
                ? `لديك ${unansweredCount} سؤال بدون إجابة. بعد التسليم لا يمكن تعديل أي إجابة.`
                : "بعد التسليم لا يمكن تعديل أي إجابة. هل أنت متأكد؟"
            }
            confirmLabel="تسليم"
            disabled={pending}
            onConfirm={async () => submit()}
          />
        )}
      </div>
    </div>
  );
}

function ResultPanel({ view, expired }: { view: AttemptView; expired: boolean }) {
  const { result } = view;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{expired ? "انتهى الوقت وتم التسليم تلقائيًا" : "تم تسليم الامتحان"}</p>
        <h1 className="text-xl font-bold">{view.examTitleAr}</h1>
        {result?.score !== null && result?.score !== undefined ? (
          <div className="space-y-1">
            <p className="text-4xl font-bold tabular-nums">
              {result.score} <span className="text-lg text-muted-foreground">/ {result.maxScore}</span>
            </p>
            <p className="text-sm text-muted-foreground">{result.percentage}%</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">النتيجة غير متاحة الآن. سيعلنها المشرف.</p>
        )}
      </section>

      {result?.correct || result?.explanations ? (
        <section className="space-y-4">
          <h2 className="font-bold">مراجعة الأسئلة</h2>
          {view.questions.map((q) => {
            const mine = view.answers[q.examQuestionId];
            const right = result.correct?.[q.examQuestionId];
            const correctIndex = right ? q.options.findIndex((o) => o.id === right) : null;
            return (
              <div key={q.examQuestionId} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  السؤال {q.order} · {mine === right ? "إجابة صحيحة" : mine ? "إجابة خاطئة" : "بدون إجابة"}
                </p>
                <QuestionPreview
                  statementAr={q.statementAr}
                  statement={q.statement}
                  options={q.options}
                  correctIndex={correctIndex}
                  explanationAr={result.explanations?.[q.examQuestionId]}
                />
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

