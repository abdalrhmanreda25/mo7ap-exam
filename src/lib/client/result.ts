import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/server/action-result";

/** Shows a toast for an action result. Maps server field errors onto the form. Returns true on success. */
export function reportResult<T, F extends FieldValues>(
  result: ActionResult<T>,
  successMessage: string,
  setError?: UseFormSetError<F>,
): result is Extract<ActionResult<T>, { ok: true }> {
  if (result.ok) {
    toast.success(successMessage);
    return true;
  }
  if (setError && result.fieldErrors) {
    for (const [field, message] of Object.entries(result.fieldErrors)) {
      setError(field as Path<F>, { type: "server", message });
    }
  }
  const detail = result.issues?.length ? `: ${result.issues.join("، ")}` : "";
  toast.error(`${result.message}${detail}`);
  return false;
}
