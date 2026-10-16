"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FormSection } from "@/components/forms/field";
import { checkboxClass, inputClass, textareaClass } from "@/components/forms/styles";
import { reportResult } from "@/lib/client/result";
import { DEFAULT_REVIEW_POLICY, examConfigSchema, MAX_DURATION_SECONDS, MIN_DURATION_SECONDS } from "@/lib/validation/exams";
import { createExamAction, updateExamAction } from "../actions";
import type { ExamDto } from "../service";

const formSchema = z.object({
  title: z.string().trim().min(1, { error: "العنوان بالإنجليزية مطلوب." }).max(200),
  titleAr: z.string().trim().min(1, { error: "العنوان بالعربية مطلوب." }).max(200),
  description: z.string().max(2000),
  subjectId: z.string().min(1, { error: "اختر المادة." }),
  academicYear: z.string().trim().min(1, { error: "السنة الدراسية مطلوبة." }).max(40),
  durationMinutes: z
    .number({ error: "أدخل المدة بالدقائق." })
    .int({ error: "المدة يجب أن تكون عددًا صحيحًا من الدقائق." })
    .min(MIN_DURATION_SECONDS / 60, { error: "المدة قصيرة جدًا." })
    .max(MAX_DURATION_SECONDS / 60, { error: "المدة طويلة جدًا." }),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  showScoreAfterSubmit: z.boolean(),
  showCorrectAnswersAfterSubmit: z.boolean(),
  showExplanationsAfterSubmit: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

export function ExamConfigForm({
  subjects,
  exam,
  readOnly = false,
}: {
  subjects: { id: string; nameAr: string }[];
  exam?: ExamDto;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: exam?.title ?? "",
      titleAr: exam?.titleAr ?? "",
      description: exam?.description ?? "",
      subjectId: exam?.subjectId ?? "",
      academicYear: exam?.academicYear ?? "",
      durationMinutes: exam ? exam.durationSeconds / 60 : 30,
      shuffleQuestions: exam?.shuffleQuestions ?? true,
      shuffleOptions: exam?.shuffleOptions ?? false,
      showScoreAfterSubmit: exam?.showScoreAfterSubmit ?? DEFAULT_REVIEW_POLICY.showScoreAfterSubmit,
      showCorrectAnswersAfterSubmit: exam?.showCorrectAnswersAfterSubmit ?? DEFAULT_REVIEW_POLICY.showCorrectAnswersAfterSubmit,
      showExplanationsAfterSubmit: exam?.showExplanationsAfterSubmit ?? DEFAULT_REVIEW_POLICY.showExplanationsAfterSubmit,
    },
  });

  const onSubmit = async (values: FormValues) => {
    const { durationMinutes, ...rest } = values;
    const parsed = examConfigSchema.safeParse({
      ...rest,
      description: rest.description.trim(),
      durationSeconds: durationMinutes * 60,
      chapterIds: exam?.chapterIds ?? [],
      lessonIds: exam?.lessonIds ?? [],
    });
    if (!parsed.success) {
      toast.error("راجع الحقول المحددة.");
      return;
    }

    const result = exam ? await updateExamAction(exam.id, parsed.data) : await createExamAction(parsed.data);
    if (!reportResult(result, exam ? "تم حفظ إعدادات الامتحان." : "تم إنشاء مسودة الامتحان.", setError)) return;
    if (exam) router.refresh();
    else router.push(`/admin/exams/${result.data.id}`);
  };

  const disabled = readOnly || isSubmitting;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {readOnly && (
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
          الامتحان منشور، لذلك إعداداته مقفلة. لتغيير الإعدادات، أغلق الامتحان ثم أنشئ نسخة جديدة.
        </p>
      )}
      <FormSection title="معلومات الامتحان">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="titleAr" label="العنوان بالعربية" error={errors.titleAr?.message}>
            <input id="titleAr" className={inputClass} disabled={disabled} aria-invalid={Boolean(errors.titleAr)} {...register("titleAr")} />
          </Field>
          <Field id="title" label="العنوان بالإنجليزية" error={errors.title?.message}>
            <input id="title" dir="ltr" className={inputClass} disabled={disabled} aria-invalid={Boolean(errors.title)} {...register("title")} />
          </Field>
          <Field id="subjectId" label="المادة" error={errors.subjectId?.message} hint={exam ? "لا يمكن تغيير المادة بعد الإنشاء." : undefined}>
            <select id="subjectId" className={inputClass} disabled={disabled || Boolean(exam)} {...register("subjectId")}>
              <option value="">اختر المادة</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          </Field>
          <Field id="academicYear" label="السنة الدراسية" error={errors.academicYear?.message}>
            <input id="academicYear" className={inputClass} disabled={disabled} aria-invalid={Boolean(errors.academicYear)} {...register("academicYear")} />
          </Field>
          <Field id="durationMinutes" label="المدة بالدقائق" error={errors.durationMinutes?.message} hint="الوقت يحسبه الخادم. المؤقت في المتصفح للعرض فقط.">
            <input id="durationMinutes" type="number" min={1} className={inputClass} disabled={disabled} aria-invalid={Boolean(errors.durationMinutes)} {...register("durationMinutes", { valueAsNumber: true })} />
          </Field>
          <Field id="description" label="التعليمات" error={errors.description?.message}>
            <textarea id="description" className={textareaClass} disabled={disabled} {...register("description")} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="الترتيب والعرض" description="يتم خلط الأسئلة والخيارات على الخادم عند بدء الامتحان.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} disabled={disabled} {...register("shuffleQuestions")} />
            خلط ترتيب الأسئلة
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} disabled={disabled} {...register("shuffleOptions")} />
            خلط ترتيب الخيارات
          </label>
        </div>
      </FormSection>

      <FormSection title="ما يراه الطالب بعد التسليم" description="سياسة المراجعة تُطبَّق على الخادم، لا في المتصفح.">
        <div className="grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} disabled={disabled} {...register("showScoreAfterSubmit")} />
            إظهار الدرجة
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} disabled={disabled} {...register("showCorrectAnswersAfterSubmit")} />
            إظهار الإجابات الصحيحة
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} disabled={disabled} {...register("showExplanationsAfterSubmit")} />
            إظهار الشروح
          </label>
        </div>
      </FormSection>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || (Boolean(exam) && !isDirty)} className="h-11 w-full px-6 sm:w-auto">
            {isSubmitting ? "جارٍ الحفظ..." : exam ? "حفظ الإعدادات" : "إنشاء مسودة"}
          </Button>
        </div>
      )}
    </form>
  );
}
