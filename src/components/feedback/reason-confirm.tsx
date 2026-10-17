"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { textareaClass } from "@/components/forms/styles";

/** Confirmation that requires a written reason. Used for audited admin actions. */
export function ReasonConfirm({
  trigger,
  title,
  description,
  confirmLabel,
  variant = "outline",
  disabled = false,
  onConfirm,
}: {
  trigger: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const id = useId();
  const valid = reason.trim().length >= 3;

  return (
    <>
      <Button type="button" variant={variant} size="sm" disabled={disabled || pending} onClick={() => dialogRef.current?.showModal()}>
        {trigger}
      </Button>
      <dialog ref={dialogRef} aria-labelledby={`${id}-title`} className="w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40">
        <div className="space-y-4 p-6">
          <h2 id={`${id}-title`} className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
          <label htmlFor={`${id}-reason`} className="block text-sm font-medium">السبب (يُحفظ في سجل التدقيق)</label>
          <textarea id={`${id}-reason`} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()} disabled={pending}>إلغاء</Button>
            <Button
              type="button"
              variant={variant === "outline" ? "default" : variant}
              disabled={!valid || pending}
              onClick={async () => {
                setPending(true);
                const ok = await onConfirm(reason.trim());
                setPending(false);
                if (ok) {
                  setReason("");
                  dialogRef.current?.close();
                }
              }}
            >
              {pending ? "جارٍ التنفيذ..." : confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
