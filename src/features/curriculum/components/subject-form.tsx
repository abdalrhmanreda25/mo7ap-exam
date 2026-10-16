"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FormSection } from "@/components/forms/field";
import { checkboxClass, inputClass, textareaClass } from "@/components/forms/styles";
import { reportResult } from "@/lib/client/result";
import { subjectInputSchema } from "@/lib/validation/curriculum";
import { createSubjectAction, updateSubjectAction } from "../actions";
import type { SubjectDto } from "../service";

const formSchema = subjectInputSchema.omit({ applicableTracks: true, description: true, name: true }).extend({
  name: z.string().max(120),
  description: z.string().max(1000),
  tracksText: z.string().max(500),
});
type FormValues = z.input<typeof formSchema>;

export function SubjectForm({ subject }: { subject?: SubjectDto }) {
  const router = useRouter();
  const isEdit = Boolean(subject);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: subject?.name ?? "",
      nameAr: subject?.nameAr ?? "",
      slug: subject?.slug ?? "",
      description: subject?.description ?? "",
      academicYear: subject?.academicYear ?? "",
      curriculum: subject?.curriculum ?? "",
      tracksText: subject?.applicableTracks.join("، ") ?? "",
      order: subject?.order ?? 1,
      isActive: subject?.isActive ?? true,
    },
  });

  const onSubmit = async (values: FormValues) => {
    const { tracksText, ...rest } = formSchema.parse(values);
    const payload = {
      ...rest,
      // The English name is optional in the UI. The Arabic name stands in when it is blank.
      name: rest.name.trim() || rest.nameAr,
      applicableTracks: tracksText
        .split(/[,،]/)
        .map((track) => track.trim())
        .filter(Boolean),
    };
    const result = isEdit
      ? await updateSubjectAction(subject!.id, payload)
      : await createSubjectAction(payload);
    if (!reportResult(result, isEdit ? "تم حفظ المادة." : "تمت إضافة المادة.", setError)) return;
    if (isEdit) router.refresh();
    else router.push(`/admin/subjects/${result.data.id}`);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FormSection title="بيانات المادة" description="المادة هي وحدة المنهج الأساسية. نطاق المنهج والسنة الدراسية يُدخلان هنا ولا يفرضهما النظام.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="nameAr" label="اسم المادة بالعربية" error={errors.nameAr?.message}>
            <input id="nameAr" className={inputClass} aria-invalid={Boolean(errors.nameAr)} {...register("nameAr")} />
          </Field>
          <Field id="name" label="اسم المادة بالإنجليزية (اختياري)" error={errors.name?.message}>
            <input id="name" dir="ltr" className={inputClass} {...register("name")} />
          </Field>
          <Field id="slug" label="المعرّف المختصر" error={errors.slug?.message} hint="أحرف لاتينية صغيرة وأرقام وشرطات، مثل: physics-2026">
            <input id="slug" dir="ltr" className={inputClass} aria-invalid={Boolean(errors.slug)} {...register("slug")} />
          </Field>
          <Field id="order" label="الترتيب" error={errors.order?.message}>
            <input id="order" type="number" min={0} className={inputClass} aria-invalid={Boolean(errors.order)} {...register("order", { valueAsNumber: true })} />
          </Field>
          <Field id="academicYear" label="السنة الدراسية" error={errors.academicYear?.message}>
            <input id="academicYear" className={inputClass} aria-invalid={Boolean(errors.academicYear)} {...register("academicYear")} />
          </Field>
          <Field id="curriculum" label="المنهج" error={errors.curriculum?.message}>
            <input id="curriculum" className={inputClass} aria-invalid={Boolean(errors.curriculum)} {...register("curriculum")} />
          </Field>
          <Field id="tracksText" label="المسارات" error={errors.tracksText?.message} hint="افصل بين المسارات بفاصلة، مثل: علمي، علمي رياضة">
            <input id="tracksText" className={inputClass} {...register("tracksText")} />
          </Field>
          <Field id="description" label="وصف مختصر" error={errors.description?.message}>
            <textarea id="description" className={textareaClass} {...register("description")} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className={checkboxClass} {...register("isActive")} />
          المادة ظاهرة للطلاب
        </label>
      </FormSection>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} className="h-11 w-full px-6 sm:w-auto">
          {isSubmitting ? "جارٍ الحفظ..." : isEdit ? "حفظ التغييرات" : "إضافة المادة"}
        </Button>
      </div>
    </form>
  );
}
