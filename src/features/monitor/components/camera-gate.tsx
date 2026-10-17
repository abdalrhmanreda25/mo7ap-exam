"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { CameraOff, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientDb } from "@/lib/firebase/firestore-client";
import { getClientAuth } from "@/lib/firebase/client";
import { RTC_CONFIG, SESSION_COLLECTION } from "../rtc";

type GateState = "asking" | "live" | "blocked";

/**
 * Blocks the exam until camera access is granted, then streams the camera to the admin.
 * Lost or revoked camera blocks the exam again. The attempt timer keeps running.
 */
export function CameraGate({ attemptId, studentId, children }: { attemptId: string; studentId: string; children: ReactNode }) {
  const [state, setState] = useState<GateState>("asking");
  const [attempt, setAttempt] = useState(0);
  const [link, setLink] = useState<LinkState>("connecting");
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
    const stop = startBroadcast(attemptId, studentId, stream, setLink);
    // Closing the connection does not stop the camera: a remount or reconnect reuses the same stream.
    return () => stop();
  }, [state, attemptId, studentId]);

  // Release the camera when the gate goes away (exam finished or page left).
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const retry = useCallback(() => {
    setState("asking");
    setAttempt((n) => n + 1);
  }, []);

  if (state === "live") {
    return (
      <>
        <div className="fixed bottom-3 start-3 z-40 flex items-center gap-2 rounded-xl border border-border bg-card/90 p-1.5 shadow-md backdrop-blur">
          <video ref={previewRef} autoPlay muted playsInline className="h-16 w-24 rounded-lg bg-muted object-cover" aria-label="معاينة الكاميرا" />
          <span className="pe-2 text-xs text-muted-foreground">
            الكاميرا تعمل
            <br />
            <span className={link === "failed" ? "text-destructive" : link === "connected" ? "text-success" : ""}>
              {link === "connected" ? "متصل بالمشرف" : link === "failed" ? "تعذر الاتصال بالمشرف" : "بانتظار المشرف"}
            </span>
          </span>
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
type LinkState = "connecting" | "connected" | "failed";

function startBroadcast(
  attemptId: string,
  studentId: string,
  stream: MediaStream,
  onLink: (state: LinkState) => void,
): () => void {
  const db = getClientDb();
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const sessionRef = doc(db, SESSION_COLLECTION, attemptId);
  const unsubs: (() => void)[] = [];
  let closed = false;
  // Candidates can appear before the session document exists. Rules need the document, so hold them until it does.
  let sessionReady = false;
  const pending: RTCIceCandidate[] = [];

  const send = (candidate: RTCIceCandidate) => {
    addDoc(collection(sessionRef, "studentCandidates"), candidate.toJSON()).catch((err: unknown) =>
      console.warn("[monitor] send candidate failed", err),
    );
  };
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") onLink("connected");
    if (pc.connectionState === "failed") {
      console.warn("[monitor] peer connection failed");
      onLink("failed");
    }
  };
  pc.onicecandidate = (event) => {
    if (!event.candidate || closed) return;
    if (sessionReady) send(event.candidate);
    else pending.push(event.candidate);
  };

  void (async () => {
    // Firestore writes must carry the restored login; wait for it before signaling.
    await getClientAuth().authStateReady();
    if (closed) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // No read first: rules deny reading a session that does not exist yet. A full write with the same
    // studentId passes the create rule (new session) and the update rule (reconnect).
    if (closed) return;
    await setDoc(sessionRef, {
      studentId,
      offer: { type: offer.type, sdp: offer.sdp },
      answer: null,
      status: "live",
      updatedAt: serverTimestamp(),
    }).catch((err: unknown) => {
      console.warn("[monitor] write session failed", err);
      throw err;
    });
    if (closed) return;
    sessionReady = true;
    pending.splice(0).forEach(send);

    // ICE candidates are only valid after the remote description is set. Hold early ones.
    const remoteCandidates: RTCIceCandidateInit[] = [];
    let remoteReady = false;
    let answerApplied = false;
    const addRemote = (c: RTCIceCandidateInit) => {
      if (remoteReady) pc.addIceCandidate(c).catch(() => undefined);
      else remoteCandidates.push(c);
    };
    unsubs.push(
      onSnapshot(sessionRef, (snap) => {
        const answer = snap.data()?.answer;
        // Snapshots can repeat (e.g. when the server timestamp resolves). Apply the answer exactly once.
        if (answer && !answerApplied && pc.signalingState === "have-local-offer" && !closed) {
          answerApplied = true;
          pc.setRemoteDescription(answer)
            .then(() => {
              remoteReady = true;
              remoteCandidates.splice(0).forEach((c) => pc.addIceCandidate(c).catch(() => undefined));
            })
            .catch((err: unknown) => {
              console.warn("[monitor] applying answer failed", err);
              onLink("failed");
            });
        }
      }, (err) => console.warn("[monitor] listen session failed", err)),
    );
    unsubs.push(
      onSnapshot(collection(sessionRef, "adminCandidates"), (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added" && !closed) addRemote(change.doc.data());
        });
      }, (err) => console.warn("[monitor] listen admin candidates failed", err)),
    );
  })().catch((err: unknown) => {
    console.warn("[monitor] signaling setup failed", err);
    if (!closed) onLink("failed");
  });

  return () => {
    closed = true;
    unsubs.forEach((u) => u());
    pc.close();
    void updateDoc(sessionRef, { status: "ended", updatedAt: serverTimestamp() }).catch(() => undefined);
  };
}
