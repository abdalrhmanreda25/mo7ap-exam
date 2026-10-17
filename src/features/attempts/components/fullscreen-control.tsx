"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportFullscreenExitAction } from "../actions";

/**
 * Fullscreen during an attempt. The browser only allows entering fullscreen from a user gesture,
 * so the student clicks the button. Leaving fullscreen is logged on the server, not blocked:
 * browsers always let the user exit with Esc.
 */
function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}
const isFullNow = () => Boolean(document.fullscreenElement);
const noFullscreen = () => false;
const isSupportedNow = () => document.fullscreenEnabled === true;

export function FullscreenControl({ attemptId, active }: { attemptId: string; active: boolean }) {
  const supported = useSyncExternalStore(() => () => {}, isSupportedNow, noFullscreen);
  const isFull = useSyncExternalStore(subscribeFullscreen, isFullNow, noFullscreen);
  const [exited, setExited] = useState(false);

  // Log each exit during an active attempt. Runs from the event, not from render.
  useEffect(() => {
    if (!active) return;
    let wasFull = Boolean(document.fullscreenElement);
    const onChange = () => {
      const full = Boolean(document.fullscreenElement);
      if (wasFull && !full) {
        setExited(true);
        void reportFullscreenExitAction(attemptId);
      }
      if (full) setExited(false);
      wasFull = full;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [attemptId, active]);

  if (!active || !supported) return null;

  const toggle = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={toggle} aria-pressed={isFull}>
        {isFull ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
        {isFull ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
      </Button>
      {!isFull && exited && (
        <p role="alert" className="text-xs text-warning">
          خرجت من ملء الشاشة. تم تسجيل ذلك لدى المشرف.
        </p>
      )}
      {!isFull && !exited && <p className="text-xs text-muted-foreground">يُفضّل الامتحان في ملء الشاشة.</p>}
    </div>
  );
}
