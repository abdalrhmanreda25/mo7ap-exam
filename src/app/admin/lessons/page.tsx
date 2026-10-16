import { redirect } from "next/navigation";

/** Lessons are managed inside each chapter of a subject. */
export default function LessonsRedirect() {
  redirect("/admin/subjects");
}
