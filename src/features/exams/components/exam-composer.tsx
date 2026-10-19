"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/feedback/confirm-action";
import { FormSection } from "@/components/forms/field";
import { inputClass } from "@/components/forms/styles";
import { QuestionPreview } from "@/features/questions/components/question-preview";
import { reportResult } from "@/lib/client/result";
import type { ActionResult } from "@/lib/server/action-result";
import {
  addExamQuestionAction,
  archiveExamAction,
  closeExamAction,
  moveExamQuestionAction,
  publishExamAction,
  removeExamQuestionAction,
  setExamQuestionPointsAction,
} from "../actions";

export interface ComposedItem {
  questionId: string;
  order: number;
  points: number;
  statementAr: string;
  statement: string;
  type: string;
  options: { id: string; text: string; textAr: string }[];
  hasKey: boolean;
  correctOptionId: string | null;
  mediaReferences: string[];
}

export interface PoolItem {
  id: string;
  statementAr: string;
  statement: string;
  difficulty: string;
}

const DIFFICULTY_AR: Record<string, string> = { EASY: "سهل", MEDIUM: "متوسط", HARD: "صعب" };

export function ExamComposer({
  examId,
  status,
  archived,
  items,
  pool,
  issues,
}: {
  examId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  archived: boolean;
  items: ComposedItem[];
  pool: PoolItem[];
  issues: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickId, setPickId] = useState("");
  const [pickPoints, setPickPoints] = useState(1);
  const [showAnswers, setShowAnswers] = useState(true);
  const isDraft = status === "DRAFT";

  const run = (task: () => Promise<ActionResult<unknown>>, success: string) =>
    startTransition(async () => {
      reportResult(await task(), success);
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <FormSection
        title="جاهزية النشر"
        description={isDraft ? "يُنشر الامتحان فقط عندما تكون كل الشروط مستوفاة." : "تمت مراجعة هذه الشروط قبل النشر."}
      >
        {isDraft && issues.length === 0 && (
          <p role="status" className="rounded-xl bg-success/10 p-4 text-sm text-success">
            الامتحان مكتمل وجاهز للنشر.
          </p>
        )}
        {isDraft && issues.length > 0 && (
          <ul role="alert" className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            {issues.map((issue) => (
              <li key={issue}>• {issue}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <ConfirmAction
              trigger="نشر الامتحان"
              title="نشر الامتحان؟"
              description={
                <>
                  بعد النشر تُجمَّد الأسئلة والدرجات والإجابات الصحيحة. لن يمكن تعديل الامتحان، ويصبح متاحًا للطالب.
                </>
              }
              confirmLabel="نشر"
              disabled={issues.length > 0 || pending}
              onConfirm={async () => {
                reportResult(await publishExamAction(examId), "تم نشر الامتحان.");
                router.refresh();
              }}
            />
          )}
          {status === "PUBLISHED" && (
            <ConfirmAction
              trigger="إغلاق الامتحان"
              title="إغلاق الامتحان؟"
              description="لن يتمكن الطلاب من بدء الامتحان بعد الإغلاق. المحاولات الجارية والنتائج المحفوظة لا تتأثر."
              confirmLabel="إغلاق"
              variant="outline"
              disabled={pending}
              onConfirm={async () => {
                reportResult(await closeExamAction(examId), "تم إغلاق الامتحان.");
                router.refresh();
              }}
            />
          )}
          {status === "CLOSED" && !archived && (
            <ConfirmAction
              trigger="أرشفة الامتحان"
              title="أرشفة الامتحان؟"
              description="تُخفى الأرشفة الامتحان من القوائم الافتراضية. لا تحذف المحاولات ولا النتائج ولا مفاتيح الإجابات."
              confirmLabel="أرشفة"
              variant="outline"
              disabled={pending}
              onConfirm={async () => {
                reportResult(await archiveExamAction(examId), "تمت أرشفة الامتحان.");
                router.refresh();
              }}
            />
          )}
        </div>
      </FormSection>

      <FormSection title={`أسئلة الامتحان (${items.length})`} description="الترتيب هنا هو الترتيب قبل الخلط. الدرجات تُجمع لتكوّن الدرجة النهائية.">
        {items.length === 0 && <p className="text-sm text-muted-foreground">لم تُضف أسئلة بعد.</p>}
        <ol className="space-y-3">
          {items.map((item, index) => (
            <li key={item.questionId} className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground">{index + 1}. </span>
                    <bdi>{item.statementAr || item.statement}</bdi>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.type === "TRUE_FALSE" ? "صح أو خطأ" : "اختيار من متعدد"} · {item.options.length} خيارات
                    {!item.hasKey && <span className="text-destructive"> · بلا إجابة صحيحة</span>}
                  </p>
                </div>
                <PointsEditor
                  key={`${item.questionId}-${item.points}`}
                  disabled={!isDraft || pending}
                  initial={item.points}
                  onSave={(points) =>
                    run(() => setExamQuestionPointsAction(examId, item.questionId, points), "تم تحديث الدرجة.")
                  }
                />
              </div>
              {isDraft && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === 0 || pending}
                    onClick={() => run(() => moveExamQuestionAction(examId, item.questionId, "up"), "تم تغيير الترتيب.")}
                  >
                    تقديم
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === items.length - 1 || pending}
                    onClick={() => run(() => moveExamQuestionAction(examId, item.questionId, "down"), "تم تغيير الترتيب.")}
                  >
                    تأخير
                  </Button>
                  <ConfirmAction
                    trigger="إزالة"
                    title="إزالة السؤال من الامتحان؟"
                    description="يُزال السؤال من هذه المسودة فقط. يبقى في بنك الأسئلة."
                    confirmLabel="إزالة"
                    variant="destructive"
                    disabled={pending}
                    onConfirm={async () => {
                      reportResult(await removeExamQuestionAction(examId, item.questionId), "تمت إزالة السؤال.");
                      router.refresh();
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>

        {isDraft && (
          <div className="grid gap-3 rounded-xl border border-dashed border-border p-4 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="pick" className="text-sm font-medium">
                إضافة سؤال من البنك
              </label>
              <select id="pick" className={inputClass} value={pickId} onChange={(e) => setPickId(e.target.value)}>
                <option value="">اختر سؤالًا جاهزًا</option>
                {pool.map((q) => (
                  <option key={q.id} value={q.id}>
                    {(q.statementAr || q.statement).slice(0, 90)} · {DIFFICULTY_AR[q.difficulty] ?? q.difficulty}
                  </option>
                ))}
              </select>
              {pool.length === 0 && (
                <p className="text-xs text-muted-foreground">لا توجد أسئلة جاهزة لهذه المادة. أضف أسئلة وحدد حالتها «جاهز».</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pick-points" className="text-sm font-medium">
                الدرجة
              </label>
              <input
                id="pick-points"
                type="number"
                min={1}
                max={100}
                className={inputClass}
                value={pickPoints}
                onChange={(e) => setPickPoints(Number(e.target.value))}
              />
            </div>
            <Button
              type="button"
              disabled={!pickId || pending}
              onClick={() =>
                run(async () => {
                  const result = await addExamQuestionAction(examId, pickId, pickPoints);
                  if (result.ok) setPickId("");
                  return result;
                }, "تمت إضافة السؤال.")
              }
            >
              إضافة
            </Button>
          </div>
        )}
      </FormSection>

      <FormSection title="معاينة الامتحان" description="الخلط يتم عند بدء الامتحان. الإجابات الصحيحة تظهر لك فقط.">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
          إظهار الإجابات الصحيحة في المعاينة
        </label>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">أضف أسئلة لتظهر المعاينة.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.questionId} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">السؤال {index + 1} · {item.points} درجة</p>
                <QuestionPreview
                  statementAr={item.statementAr}
                  statement={item.statement}
                  options={item.options.map((o) => ({ id: o.id, text: o.text, textAr: o.textAr }))}
                  correctIndex={showAnswers ? item.options.findIndex((o) => o.id === item.correctOptionId) : null}
                  media={item.mediaReferences}
                />
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}

function PointsEditor({ initial, disabled, onSave }: { initial: number; disabled: boolean; onSave: (points: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">الدرجة</span>
      <input
        type="number"
        min={1}
        max={100}
        disabled={disabled}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onBlur={() => {
          if (value !== initial && Number.isInteger(value) && value >= 1 && value <= 100) onSave(value);
        }}
        className="h-9 w-20 rounded-lg border border-input bg-card px-2 text-center text-sm disabled:bg-muted"
        aria-label="درجة السؤال"
      />
    </label>
  );
}
