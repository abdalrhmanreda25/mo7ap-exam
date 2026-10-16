"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FormSection } from "@/components/forms/field";
import { checkboxClass, inputClass, textareaClass } from "@/components/forms/styles";
import { reportResult } from "@/lib/client/result";
import { CONTENT_FIELD_LABELS } from "../content-lock";
import { createQuestionAction, updateQuestionAction } from "../actions";
import type { QuestionDetail } from "../service";
import { QuestionPreview } from "./question-preview";

export interface Catalog {
  subjects: { id: string; nameAr: string }[];
  chapters: { id: string; subjectId: string; titleAr: string }[];
  lessons: { id: string; chapterId: string; subjectId: string; titleAr: string }[];
}

const formSchema = z.object({
  subjectId: z.string().min(1, { error: "اختر المادة." }),
  chapterId: z.string().min(1, { error: "اختر الفصل." }),
  lessonId: z.string().min(1, { error: "اختر الدرس." }),
  type: z.enum(["SINGLE_CHOICE", "TRUE_FALSE"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  status: z.enum(["DRAFT", "READY", "ARCHIVED"]),
  statement: z.string(),
  statementAr: z.string(),
  explanation: z.string(),
  explanationAr: z.string(),
  mediaText: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string(), textAr: z.string() })).min(2).max(6),
  correctIndex: z.number().int().min(0),
});
type FormValues = z.infer<typeof formSchema>;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `opt-${Math.random().toString(36).slice(2, 10)}`;

const emptyOption = () => ({ id: newId(), text: "", textAr: "" });

function defaultsFrom(question: QuestionDetail | undefined): FormValues {
  if (!question) {
    return {
      subjectId: "",
      chapterId: "",
      lessonId: "",
      type: "SINGLE_CHOICE",
      difficulty: "EASY",
      status: "DRAFT",
      statement: "",
      statementAr: "",
      explanation: "",
      explanationAr: "",
      mediaText: "",
      options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
      correctIndex: 0,
    };
  }
  const options = [...question.options].sort((a, b) => a.order - b.order);
  return {
    subjectId: question.subjectId,
    chapterId: question.chapterId,
    lessonId: question.lessonId,
    type: question.type,
    difficulty: question.difficulty,
    status: question.status,
    statement: question.statement,
    statementAr: question.statementAr,
    explanation: question.explanation,
    explanationAr: question.explanationAr,
    mediaText: question.mediaReferences.join("\n"),
    options: options.map((o) => ({ id: o.id, text: o.text, textAr: o.textAr })),
    correctIndex: Math.max(0, options.findIndex((o) => o.id === question.correctOptionId)),
  };
}

export function QuestionForm({ catalog, question }: { catalog: Catalog; question?: QuestionDetail }) {
  const router = useRouter();
  const locked = Boolean(question?.locked);
  const [serverIssues, setServerIssues] = useState<string[]>([]);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFrom(question),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "options" });
  const watched = useWatch({ control });
  const subjectId = watched.subjectId ?? "";
  const chapterId = watched.chapterId ?? "";
  const type = watched.type ?? "SINGLE_CHOICE";
  const correctIndex = watched.correctIndex ?? 0;

  const chapters = catalog.chapters.filter((c) => c.subjectId === subjectId);
  const lessons = catalog.lessons.filter((l) => l.chapterId === chapterId);
  const optionCount = fields.length;

  const onSubmit = async (values: FormValues) => {
    setServerIssues([]);
    const options = values.options.map((option, index) => ({
      id: option.id,
      text: option.text.trim(),
      textAr: option.textAr.trim(),
      order: index + 1,
    }));
    const correct = options[values.correctIndex];
    const payload = {
      subjectId: values.subjectId,
      chapterId: values.chapterId,
      lessonId: values.lessonId,
      type: values.type,
      statement: values.statement.trim(),
      statementAr: values.statementAr.trim(),
      mediaReferences: values.mediaText.split("\n").map((line) => line.trim()).filter(Boolean),
      difficulty: values.difficulty,
      explanation: values.explanation.trim(),
      explanationAr: values.explanationAr.trim(),
      status: values.status,
      options,
      correctOptionId: correct?.id ?? "",
    };

    const result = question
      ? await updateQuestionAction(question.id, payload)
      : await createQuestionAction(payload);
    if (!result.ok && result.fieldErrors) {
      setServerIssues(Object.values(result.fieldErrors));
    }
    if (!reportResult(result, question ? "تم حفظ السؤال." : "تمت إضافة السؤال إلى البنك.", setError)) return;
    if (question) router.refresh();
    else router.push(`/admin/questions/${result.data.id}`);
  };

  const previewOptions = fields.map((field, index) => ({
    id: field.id,
    text: watched.options?.[index]?.text ?? "",
    textAr: watched.options?.[index]?.textAr ?? "",
  }));

  const lockedFieldList = locked
    ? Object.values(CONTENT_FIELD_LABELS).join("، ")
    : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {locked && (
          <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            هذا السؤال مستخدم في امتحان منشور أو مغلق. محتواه مقفل ولا يمكن تغييره حتى لا يتغير تاريخ الامتحانات.
            يمكن تعديل الدرس والصعوبة والحالة فقط. الحقول المقفلة: {lockedFieldList}.
          </div>
        )}

        <FormSection title="التصنيف" description="يحدد مكان السؤال في المنهج وأين يظهر في بناء الامتحانات.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="subjectId" label="المادة" error={errors.subjectId?.message}>
              <select
                id="subjectId"
                className={inputClass}
                disabled={locked || Boolean(question)}
                {...register("subjectId", {
                  onChange: () => {
                    setValue("chapterId", "");
                    setValue("lessonId", "");
                  },
                })}
              >
                <option value="">اختر المادة</option>
                {catalog.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="chapterId" label="الفصل" error={errors.chapterId?.message}>
              <select
                id="chapterId"
                className={inputClass}
                disabled={!subjectId}
                {...register("chapterId", {
                  onChange: () => setValue("lessonId", ""),
                })}
              >
                <option value="">اختر الفصل</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titleAr}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="lessonId" label="الدرس" error={errors.lessonId?.message}>
              <select id="lessonId" className={inputClass} disabled={!chapterId} {...register("lessonId")}>
                <option value="">اختر الدرس</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.titleAr}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="difficulty" label="الصعوبة" error={errors.difficulty?.message}>
              <select id="difficulty" className={inputClass} {...register("difficulty")}>
                <option value="EASY">سهل</option>
                <option value="MEDIUM">متوسط</option>
                <option value="HARD">صعب</option>
              </select>
            </Field>
            <Field id="type" label="نوع السؤال" error={errors.type?.message}>
              <select
                id="type"
                className={inputClass}
                disabled={locked}
                {...register("type", {
                  onChange: (event) => {
                    if (event.target.value === "TRUE_FALSE") {
                      const current = getValues("options");
                      if (current.length !== 2) {
                        setValue("options", [
                          { id: current[0]?.id ?? newId(), text: "True", textAr: "صح" },
                          { id: current[1]?.id ?? newId(), text: "False", textAr: "خطأ" },
                        ]);
                        setValue("correctIndex", 0);
                      }
                    }
                  },
                })}
              >
                <option value="SINGLE_CHOICE">اختيار من متعدد</option>
                <option value="TRUE_FALSE">صح أو خطأ</option>
              </select>
            </Field>
            <Field id="status" label="الحالة" error={errors.status?.message} hint="الأسئلة الجاهزة فقط تُضاف إلى الامتحانات.">
              <select id="status" className={inputClass} {...register("status")}>
                <option value="DRAFT">مسودة</option>
                <option value="READY">جاهز</option>
                <option value="ARCHIVED">مؤرشف</option>
              </select>
            </Field>
          </div>
        </FormSection>

        <FormSection title="نص السؤال">
          <Field id="statementAr" label="نص السؤال بالعربية" error={errors.statementAr?.message} hint="يدعم العربية والمعادلات مثل x² + 2x. الصيغ المعقدة تُكتب نصًا.">
            <textarea id="statementAr" className={textareaClass} disabled={locked} {...register("statementAr")} />
          </Field>
          <Field id="statement" label="نص السؤال بالإنجليزية" error={errors.statement?.message} hint="مطلوب. يُستخدم عند عدم وجود نص عربي.">
            <textarea id="statement" dir="ltr" className={textareaClass} disabled={locked} aria-invalid={Boolean(errors.statement)} {...register("statement")} />
          </Field>
          <Field id="mediaText" label="روابط الوسائط" hint="رابط واحد في كل سطر. اختياري.">
            <textarea id="mediaText" dir="ltr" className={textareaClass} {...register("mediaText")} />
          </Field>
        </FormSection>

        <FormSection title="الخيارات والإجابة الصحيحة" description="حدد الخيار الصحيح بالدائرة بجانبه. الإجابة الصحيحة لا تظهر للطالب أبدًا.">
          <ul className="space-y-3">
            {fields.map((field, index) => (
              <li key={field.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="correct"
                    className={checkboxClass}
                    checked={correctIndex === index}
                    disabled={locked}
                    onChange={() => setValue("correctIndex", index)}
                    aria-label={`الخيار ${index + 1} صحيح`}
                  />
                  <span>{index + 1}</span>
                </label>
                <input
                  className={inputClass}
                  placeholder="بالعربية"
                  aria-label={`الخيار ${index + 1} بالعربية`}
                  disabled={locked}
                  {...register(`options.${index}.textAr`)}
                />
                <input
                  dir="ltr"
                  className={inputClass}
                  placeholder="English"
                  aria-label={`الخيار ${index + 1} بالإنجليزية`}
                  disabled={locked}
                  {...register(`options.${index}.text`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={locked || type === "TRUE_FALSE" || optionCount <= 2}
                  onClick={() => {
                    remove(index);
                    if (correctIndex >= index && correctIndex > 0) setValue("correctIndex", correctIndex - 1);
                  }}
                >
                  حذف
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locked || type === "TRUE_FALSE" || optionCount >= 6}
            onClick={() => append(emptyOption())}
          >
            إضافة خيار
          </Button>
          {errors.options?.message && <p role="alert" className="text-xs text-destructive">{errors.options.message}</p>}
          {errors.correctIndex?.message && <p role="alert" className="text-xs text-destructive">{errors.correctIndex.message}</p>}
        </FormSection>

        <FormSection title="الشرح" description="يظهر للطالب بعد التسليم فقط إذا فعّل المشرف ذلك في الامتحان.">
          <Field id="explanationAr" label="الشرح بالعربية">
            <textarea id="explanationAr" className={textareaClass} disabled={locked} {...register("explanationAr")} />
          </Field>
          <Field id="explanation" label="الشرح بالإنجليزية">
            <textarea id="explanation" dir="ltr" className={textareaClass} disabled={locked} {...register("explanation")} />
          </Field>
        </FormSection>

        {serverIssues.length > 0 && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <ul className="list-inside list-disc">
              {serverIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="h-11 w-full px-6 sm:w-auto">
            {isSubmitting ? "جارٍ الحفظ..." : question ? "حفظ التغييرات" : "إضافة السؤال"}
          </Button>
        </div>
      </form>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-sm font-bold text-muted-foreground">معاينة كما يراها الطالب</h2>
        <QuestionPreview
          statementAr={watched.statementAr ?? ""}
          statement={watched.statement ?? ""}
          options={previewOptions}
          correctIndex={null}
          explanationAr={undefined}
        />
        <p className="text-xs text-muted-foreground">هذه المعاينة لا تُظهر الإجابة الصحيحة، ولا يراها الطلاب قبل التسليم.</p>
      </aside>
    </div>
  );
}
