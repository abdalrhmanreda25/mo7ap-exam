"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { CameraOff, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientDb } from "@/lib/firebase/firestore-client";
import { RTC_CONFIG, SESSION_COLLECTION } from "../rtc";

type GateState = "asking" | "live" | "blocked";

/**
 * Blocks the exam until camera access is granted, then streams the camera to the admin.
 * Lost or revoked camera blocks the exam again. The attempt timer keeps running.
 */
export function CameraGate({ attemptId, studentId, children }: { attemptId: string; studentId: string; children: ReactNode }) {
  const [state, setState] = useState<GateState>("asking");
  const [attempt, setAttempt] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  // Ask for the camera. Runs on mount and on retry. State changes only after the await.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        stream.getVideoTracks().forEach((t) => (t.onended = () => setState("blocked")));
        setState("live");
      })
      .catch(() => {
        if (!cancelled) setState("blocked");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Self-preview and broadcast while live.
  useEffect(() => {
    if (state !== "live" || !streamRef.current) return;
    const stream = streamRef.current;
    if (previewRef.current) previewRef.current.srcObject = stream;
    const stop = startBroadcast(attemptId, studentId, stream);
    return () => {
      stop();
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [state, attemptId, studentId]);

  const retry = useCallback(() => {
    setState("asking");
    setAttempt((n) => n + 1);
  }, []);

  if (state === "live") {
    return (
      <>
        <div className="fixed bottom-3 start-3 z-40 flex items-center gap-2 rounded-xl border border-border bg-card/90 p-1.5 shadow-md backdrop-blur">
          <video ref={previewRef} autoPlay muted playsInline className="h-16 w-24 rounded-lg bg-muted object-cover" aria-label="معاينة الكاميرا" />
          <span className="pe-2 text-xs text-muted-foreground">الكاميرا تعمل</span>
        </div>
        {children}
      </>
    );
  }

  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 rounded-2xl border border-warning/40 bg-warning/10 p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-card text-warning">
        {state === "asking" ? <Camera className="size-6" aria-hidden="true" /> : <CameraOff className="size-6" aria-hidden="true" />}
      </span>
      <h2 className="font-bold">{state === "asking" ? "جارٍ طلب إذن الكاميرا..." : "يجب السماح بالكاميرا للمتابعة"}</h2>
      <p className="text-sm text-muted-foreground">
        الامتحان يتطلب تشغيل الكاميرا طوال المدة. الصورة تُعرض مباشرة للمشرف ولا تُسجَّل أو تُحفظ.
      </p>
      {state === "blocked" && (
        <Button type="button" className="h-11 w-full" onClick={retry}>
          السماح بالكاميرا والمتابعة
        </Button>
      )}
    </div>
  );
}

/** Publishes the camera to the admin. Returns a cleanup that closes the connection and marks the session ended. */
function startBroadcast(attemptId: string, studentId: string, stream: MediaStream): () => void {
  const db = getClientDb();
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const sessionRef = doc(db, SESSION_COLLECTION, attemptId);
  const unsubs: (() => void)[] = [];
  let closed = false;

  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  pc.onicecandidate = (event) => {
    if (event.candidate && !closed) void addDoc(collection(sessionRef, "studentCandidates"), event.candidate.toJSON());
  };

  void (async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const payload = { offer: { type: offer.type, sdp: offer.sdp }, answer: null, status: "live", updatedAt: serverTimestamp() };
    if ((await getDoc(sessionRef)).exists()) {
      await updateDoc(sessionRef, payload);
    } else {
      await setDoc(sessionRef, { studentId, ...payload });
    }

    unsubs.push(
      onSnapshot(sessionRef, (snap) => {
        const answer = snap.data()?.answer;
        if (answer && !pc.currentRemoteDescription && !closed) void pc.setRemoteDescription(answer);
      }),
    );
    unsubs.push(
      onSnapshot(collection(sessionRef, "adminCandidates"), (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added" && !closed) void pc.addIceCandidate(change.doc.data());
        });
      }),
    );
  })();

  return () => {
    closed = true;
    unsubs.forEach((u) => u());
    pc.close();
    void updateDoc(sessionRef, { status: "ended", updatedAt: serverTimestamp() }).catch(() => undefined);
  };
}
