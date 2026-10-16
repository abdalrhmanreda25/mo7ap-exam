import { redirect } from "next/navigation";

/** Chapters are managed inside each subject, where their parent is always known. */
export default function ChaptersRedirect() {
  redirect("/admin/subjects");
}
