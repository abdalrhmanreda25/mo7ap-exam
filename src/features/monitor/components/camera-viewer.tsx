"use client";

import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc, type DocumentData } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/firestore-client";
import { getClientAuth } from "@/lib/firebase/client";
import { RTC_CONFIG, SESSION_COLLECTION } from "../rtc";
import { StatusBadge } from "@/components/layout/page-header";

type Status = "waiting" | "connecting" | "live" | "ended" | "error";
interface Offer {
  type: RTCSdpType;
  sdp: string;
}

/**
 * Admin side. Answers the student's offer and shows the live camera. Nothing is recorded.
 * A new offer (student reconnected) gets a fresh peer connection. Errors are shown, not swallowed.
 */
export function CameraViewer({ attemptId }: { attemptId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState<string | null>(null);

  // Watch the session document. Refresh the ID token first: the rules need the role claim,
  // and a token issued before the claim was set would be denied.
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const attach = (sessionRef: ReturnType<typeof doc>) =>
      onSnapshot(
        sessionRef,
        (snap) => {
          const data: DocumentData | undefined = snap.data();
          if (!data) return;
          if (data.status === "ended") {
            setStatus("ended");
            setOffer(null);
            return;
          }
          if (data.offer) setStatus((prev) => (prev === "live" ? prev : "connecting"));
          setOffer(data.offer ?? null);
        },
        (err) => {
          setStatus("error");
          setError(
            err.code === "permission-denied"
              ? "لا تملك صلاحية مشاهدة هذه الجلسة. سجّل الخروج ثم الدخول من جديد بحساب المشرف."
              : `تعذر قراءة الجلسة: ${err.code}`,
          );
        },
      );

    void (async () => {
      // Wait for Firebase to restore the browser login. Subscribing earlier sends an unauthenticated read.
      const auth = getClientAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) {
        if (!cancelled) {
          setStatus("error");
          setError("انتهت جلسة الدخول في هذا المتصفح. سجّل الخروج ثم الدخول من جديد.");
        }
        return;
      }
      await user.getIdToken(true);
      if (cancelled) return;
      unsub = attach(doc(getClientDb(), SESSION_COLLECTION, attemptId));
    })().catch((err: { code?: string }) => {
      setStatus("error");
      setError(`تعذر تحديث صلاحية الدخول: ${err.code ?? "unknown"}`);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [attemptId]);

  // Answer each new offer.
  const offerSdp = offer?.sdp ?? null;
  useEffect(() => {
    if (!offerSdp || !offer) return;
    const db = getClientDb();
    const sessionRef = doc(db, SESSION_COLLECTION, attemptId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const unsubs: (() => void)[] = [];
    let closed = false;
    pc.ontrack = (event) => {
      if (videoRef.current) videoRef.current.srcObject = event.streams[0];
    };
    const remoteCandidates: RTCIceCandidateInit[] = [];
    let remoteReady = false;
    pc.onicecandidate = (event) => {
      if (event.candidate && !closed) {
        addDoc(collection(sessionRef, "adminCandidates"), event.candidate.toJSON()).catch((err: { code?: string }) =>
          setError(`تعذر إرسال الاتصال: ${err.code ?? "unknown"}`),
        );
      }
    };
    pc.onconnectionstatechange = () => {
      // "Live" means media can actually flow, not just that a track was negotiated.
      if (pc.connectionState === "connected") setStatus("live");
      if (pc.connectionState === "failed") {
        setStatus("error");
        setError("فشل الاتصال بالكاميرا. أعد تحميل الصفحة.");
      }
    };

    void (async () => {
      try {
        await pc.setRemoteDescription(offer);
        remoteReady = true;
        remoteCandidates.splice(0).forEach((c) => pc.addIceCandidate(c).catch(() => undefined));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(sessionRef, { answer: { type: answer.type, sdp: answer.sdp }, updatedAt: serverTimestamp() });
      } catch (err) {
        if (!closed) {
          setStatus("error");
          setError(`تعذر الرد على اتصال الطالب: ${err instanceof Error ? err.message : "خطأ غير معروف"}`);
        }
      }
    })();

    unsubs.push(
      onSnapshot(
        collection(sessionRef, "studentCandidates"),
        (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type !== "added" || closed) return;
            const candidate = change.doc.data() as RTCIceCandidateInit;
            if (remoteReady) pc.addIceCandidate(candidate).catch(() => undefined);
            else remoteCandidates.push(candidate);
          });
        },
        (err) => {
          setError(`تعذر قراءة اتصال الطالب: ${err.code}`);
        },
      ),
    );

    return () => {
      closed = true;
      unsubs.forEach((u) => u());
      pc.close();
    };
    // Re-run only when the offer itself changes. Snapshots that change only the answer must not reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerSdp, attemptId]);

  const label: Record<Status, string> = {
    waiting: "بانتظار الاتصال",
    connecting: "جارٍ الاتصال",
    live: "مباشر",
    ended: "انتهت المتابعة",
    error: "خطأ",
  };
  const tone = status === "live" ? "success" : status === "error" ? "warning" : status === "ended" ? "neutral" : "primary";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatusBadge tone={tone}>{label[status]}</StatusBadge>
        <span className="text-xs text-muted-foreground">بث مباشر فقط، لا يُسجَّل</span>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <video ref={videoRef} autoPlay playsInline controls={false} className="aspect-video w-full rounded-2xl bg-black object-contain" aria-label="كاميرا الطالب" />
    </div>
  );
}
