/** School years. A student sees only the subjects and exams of their own year. */
export const GRADES = [
  { id: "prep1", labelAr: "الصف الأول الإعدادي" },
  { id: "prep2", labelAr: "الصف الثاني الإعدادي" },
  { id: "prep3", labelAr: "الصف الثالث الإعدادي" },
  { id: "sec1", labelAr: "الصف الأول الثانوي" },
  { id: "sec2", labelAr: "الصف الثاني الثانوي" },
  { id: "sec3", labelAr: "الصف الثالث الثانوي" },
] as const;

export type GradeId = (typeof GRADES)[number]["id"];
export const GRADE_IDS = GRADES.map((g) => g.id) as [GradeId, ...GradeId[]];

/** Students, subjects, and exams saved before years existed were all Thanaweya Amma. */
export const DEFAULT_GRADE: GradeId = "sec3";

export function gradeOf(value: unknown): GradeId {
  return GRADE_IDS.includes(value as GradeId) ? (value as GradeId) : DEFAULT_GRADE;
}

export function gradeLabel(id: GradeId): string {
  return GRADES.find((g) => g.id === id)!.labelAr;
}
