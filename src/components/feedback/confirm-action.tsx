"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Confirmation for destructive or irreversible actions. Uses the native dialog element,
 * which traps focus, closes on Escape, and is announced to screen readers as a modal.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  variant = "default",
  disabled = false,
  onConfirm,
}: {
  trigger: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  variant?: "default" | "destructive" | "outline";
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
      dialogRef.current?.close();
    }
  };

  return (
    <>
      <Button type="button" variant={variant} disabled={disabled || pending} onClick={() => dialogRef.current?.showModal()}>
        {trigger}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="confirm-title"
        className="w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="space-y-4 p-6">
          <h2 id="confirm-title" className="text-lg font-bold">
            {title}
          </h2>
          <div className="text-sm text-muted-foreground">{description}</div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()} disabled={pending}>
              إلغاء
            </Button>
            <Button type="button" variant={variant} onClick={handleConfirm} disabled={pending}>
              {pending ? "جارٍ التنفيذ..." : confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
