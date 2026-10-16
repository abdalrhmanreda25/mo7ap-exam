import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SubjectForm } from "@/features/curriculum/components/subject-form";

export const metadata: Metadata = { title: "إضافة مادة" };

export default function NewSubjectPage() {
  return (
    <>
      <PageHeader title="إضافة مادة" description="بعد الحفظ تضيف الفصول والدروس من صفحة المادة." />
      <SubjectForm />
    </>
  );
}
