"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { checkboxClass, inputClass } from "@/components/forms/styles";
import { reportResult } from "@/lib/client/result";
import { createChapterAction, createLessonAction, updateChapterAction, updateLessonAction } from "../actions";
import type { ChapterDto, LessonDto } from "../service";

const itemFormSchema = z.object({
  titleAr: z.string().trim().min(1, { error: "العنوان بالعربية مطلوب." }).max(160),
  title: z.string().trim().max(160),
  order: z.number().int().min(0, { error: "الترتيب يجب أن يكون صفرًا أو أكبر." }),
  isActive: z.boolean(),
});
type ItemFormValues = z.infer<typeof itemFormSchema>;

type Kind = "chapter" | "lesson";

/** Create-or-edit form shared by chapters and lessons. */
function ItemForm({
  kind,
  initial,
  parentIds,
  submitLabel,
  onDone,
}: {
  kind: Kind;
  initial?: { id: string; titleAr: string; title: string; order: number; isActive: boolean };
  parentIds: { subjectId: string; chapterId?: string };
  submitLabel: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const idPrefix = `${kind}-${initial?.id ?? "new"}`;
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      titleAr: initial?.titleAr ?? "",
      title: initial?.title ?? "",
      order: initial?.order ?? 1,
      isActive: initial?.isActive ?? true,
    },
  });

  const onSubmit = async (values: ItemFormValues) => {
    // English title is optional in the UI; the Arabic title stands in when it is blank.
    const base = { titleAr: values.titleAr, title: values.title || values.titleAr, order: values.order, isActive: values.isActive };
    const payload =
      kind === "chapter"
        ? { ...base, subjectId: parentIds.subjectId, description: "" }
        : { ...base, subjectId: parentIds.subjectId, chapterId: parentIds.chapterId };

    const result =
      kind === "chapter"
        ? initial
          ? await updateChapterAction(initial.id, payload)
          : await createChapterAction(payload)
        : initial
          ? await updateLessonAction(initial.id, payload)
          : await createLessonAction(payload);

    const label = kind === "chapter" ? "الفصل" : "الدرس";
    if (!reportResult(result, `تم حفظ ${label}.`, setError)) return;
    if (!initial) reset({ titleAr: "", title: "", order: values.order + 1, isActive: true });
    onDone?.();
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_auto] sm:items-end">
      <Field id={`${idPrefix}-titleAr`} label="العنوان بالعربية" error={errors.titleAr?.message}>
        <input id={`${idPrefix}-titleAr`} className={inputClass} aria-invalid={Boolean(errors.titleAr)} {...register("titleAr")} />
      </Field>
      <Field id={`${idPrefix}-title`} label="العنوان بالإنجليزية" error={errors.title?.message}>
        <input id={`${idPrefix}-title`} dir="ltr" className={inputClass} {...register("title")} />
      </Field>
      <Field id={`${idPrefix}-order`} label="الترتيب" error={errors.order?.message}>
        <input id={`${idPrefix}-order`} type="number" min={0} className={inputClass} {...register("order", { valueAsNumber: true })} />
      </Field>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className={checkboxClass} {...register("isActive")} />
          ظاهر
        </label>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "جارٍ الحفظ..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function CurriculumManager({
  subjectId,
  chapters,
  lessons,
}: {
  subjectId: string;
  chapters: ChapterDto[];
  lessons: LessonDto[];
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-4">
        <h3 className="text-sm font-bold">إضافة فصل</h3>
        <ItemForm kind="chapter" parentIds={{ subjectId }} submitLabel="إضافة الفصل" />
      </div>

      {chapters.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">لا توجد فصول بعد. أضف الفصل الأول لبدء بناء المنهج.</p>
      )}

      {chapters.map((chapter) => {
        const chapterLessons = lessons.filter((lesson) => lesson.chapterId === chapter.id);
        return (
          <article key={chapter.id} className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold">{chapter.titleAr}</h3>
                <p className="text-xs text-muted-foreground">
                  الترتيب {chapter.order} · {chapter.isActive ? "ظاهر" : "مخفي"} · {chapterLessons.length} درس
                </p>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-primary">تعديل الفصل</summary>
                <div className="mt-3">
                  <ItemForm
                    kind="chapter"
                    initial={chapter}
                    parentIds={{ subjectId }}
                    submitLabel="حفظ الفصل"
                  />
                </div>
              </details>
            </header>

            <ul className="space-y-2">
              {chapterLessons.map((lesson) => (
                <li key={lesson.id} className="rounded-xl bg-muted/50 p-3">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{lesson.titleAr}</span>
                      <span className="text-xs text-muted-foreground">
                        الترتيب {lesson.order} · {lesson.isActive ? "ظاهر" : "مخفي"}
                      </span>
                    </summary>
                    <div className="mt-3">
                      <ItemForm
                        kind="lesson"
                        initial={lesson}
                        parentIds={{ subjectId, chapterId: chapter.id }}
                        submitLabel="حفظ الدرس"
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>

            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-primary">إضافة درس إلى هذا الفصل</summary>
              <div className="mt-3">
                <ItemForm kind="lesson" parentIds={{ subjectId, chapterId: chapter.id }} submitLabel="إضافة الدرس" />
              </div>
            </details>
          </article>
        );
      })}
    </div>
  );
}
