"use client";

import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc, type DocumentData } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/firestore-client";
import { getClientAuth } from "@/lib/firebase/client";
import { RTC_CONFIG, SESSION_COLLECTION } from "../rtc";
import { StatusBadge } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

type Status = "waiting" | "connecting" | "live" | "ended" | "elsewhere" | "error";
type Hint = "noReply" | "network";
interface Offer {
  type: RTCSdpType;
  sdp: string;
}

/** Firestore candidate docs carry the viewer they belong to; WebRTC wants only the candidate fields. */
const toCandidate = ({ candidate, sdpMid, sdpMLineIndex, usernameFragment }: RTCIceCandidateInit): RTCIceCandidateInit => ({
  candidate,
  sdpMid,
  sdpMLineIndex,
  usernameFragment,
});

/**
 * Admin side. Each mount is a new viewer: it asks the student for a fresh offer (request.viewerId),
 * answers only the offer made for it, and shows the live camera. Leaving the page and coming back
 * therefore reconnects. Nothing is recorded. Errors are shown, not swallowed.
 */
export function CameraViewer({ attemptId }: { attemptId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const claimRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    // A retry takes a new viewer ID: the student reconnects only when the requested viewer changes.
    let viewerId = crypto.randomUUID();
    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let answeredSdp: string | null = null;
    let requested = false;
    let remoteReady = false;
    const pendingCandidates: RTCIceCandidateInit[] = [];
    const unsubs: (() => void)[] = [];
    // If nothing arrives in time, say why instead of showing "connecting" forever.
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const expect = (ms: number, reason: Hint) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => !cancelled && setHint(reason), ms);
    };
    const settle = () => {
      clearTimeout(watchdog);
      setHint(null);
    };
    const sessionRef = doc(getClientDb(), SESSION_COLLECTION, attemptId);

    const closePeer = () => {
      pc?.close();
      pc = null;
      remoteReady = false;
      answeredSdp = null;
    };

    const claim = () => {
      closePeer();
      viewerId = crypto.randomUUID();
      requested = true;
      setStatus("connecting");
      setHint(null);
      expect(15_000, "noReply");
      updateDoc(sessionRef, { request: { viewerId, at: serverTimestamp() }, updatedAt: serverTimestamp() }).catch((err: { code?: string }) => {
        if (!cancelled) {
          setStatus("error");
          setError(`تعذر طلب الاتصال بالطالب: ${err.code ?? "unknown"}`);
        }
      });
    };
    claimRef.current = claim;

    const answer = async (offer: Offer) => {
      closePeer();
      const peer = new RTCPeerConnection(RTC_CONFIG);
      pc = peer;
      answeredSdp = offer.sdp;
      peer.ontrack = (event) => {
        if (videoRef.current) videoRef.current.srcObject = event.streams[0];
      };
      peer.onicecandidate = (event) => {
        if (!event.candidate || cancelled || pc !== peer) return;
        addDoc(collection(sessionRef, "adminCandidates"), { ...event.candidate.toJSON(), viewerId }).catch((err: { code?: string }) =>
          setError(`تعذر إرسال الاتصال: ${err.code ?? "unknown"}`),
        );
      };
      peer.onconnectionstatechange = () => {
        if (pc !== peer) return;
        // "Live" means media can actually flow, not just that a track was negotiated.
        if (peer.connectionState === "connected") {
          setStatus("live");
          setError(null);
          settle();
        }
        if (peer.connectionState === "failed") {
          setStatus("error");
          setError("فشل الاتصال بالكاميرا. أعد تحميل الصفحة.");
        }
      };
      await peer.setRemoteDescription(offer);
      if (pc !== peer) return;
      remoteReady = true;
      pendingCandidates.splice(0).forEach((c) => peer.addIceCandidate(c).catch(() => undefined));
      const local = await peer.createAnswer();
      await peer.setLocalDescription(local);
      if (pc !== peer || cancelled) return;
      await updateDoc(sessionRef, { answer: { type: local.type, sdp: local.sdp }, updatedAt: serverTimestamp() });
      expect(20_000, "network");
    };

    const watch = () => {
      unsubs.push(
        onSnapshot(
          sessionRef,
          (snap) => {
            const data: DocumentData | undefined = snap.data();
            if (!data || cancelled) return;
            if (data.status === "ended") {
              closePeer();
              settle();
              setStatus("ended");
              return;
            }
            if (!requested) {
              claim();
              return;
            }
            const requester = (data.request?.viewerId as string | undefined) ?? null;
            if (requester && requester !== viewerId) {
              // A newer viewer (another tab or window) took over. Do not fight it.
              closePeer();
              settle();
              setStatus("elsewhere");
              return;
            }
            const offer = data.offer as Offer | null;
            if (data.offerFor === viewerId && offer?.sdp && offer.sdp !== answeredSdp) {
              setStatus("connecting");
              answer(offer).catch((err: unknown) => {
                if (!cancelled) {
                  setStatus("error");
                  setError(`تعذر الرد على اتصال الطالب: ${err instanceof Error ? err.message : "خطأ غير معروف"}`);
                }
              });
            }
          },
          (err) => {
            setStatus("error");
            setError(
              err.code === "permission-denied"
                ? "لا تملك صلاحية مشاهدة هذه الجلسة. سجّل الخروج ثم الدخول من جديد بحساب المشرف."
                : `تعذر قراءة الجلسة: ${err.code}`,
            );
          },
        ),
      );
      unsubs.push(
        onSnapshot(
          collection(sessionRef, "studentCandidates"),
          (snap) => {
            snap.docChanges().forEach((change) => {
              const data = change.doc.data() as RTCIceCandidateInit & { viewerId?: string };
              if (change.type !== "added" || cancelled || data.viewerId !== viewerId) return;
              if (pc && remoteReady) pc.addIceCandidate(toCandidate(data)).catch(() => undefined);
              else pendingCandidates.push(toCandidate(data));
            });
          },
          (err) => setError(`تعذر قراءة اتصال الطالب: ${err.code}`),
        ),
      );
    };

    // Wait for Firebase to restore the browser login, then refresh the ID token: the rules need the
    // role claim, and a token issued before the claim was set would be denied.
    void (async () => {
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
      if (!cancelled) watch();
    })().catch((err: { code?: string }) => {
      setStatus("error");
      setError(`تعذر تحديث صلاحية الدخول: ${err.code ?? "unknown"}`);
    });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      unsubs.forEach((u) => u());
      closePeer();
    };
  }, [attemptId]);

  const label: Record<Status, string> = {
    waiting: "بانتظار الاتصال",
    connecting: "جارٍ الاتصال",
    live: "مباشر",
    ended: "انتهت المتابعة",
    elsewhere: "مفتوحة في نافذة أخرى",
    error: "خطأ",
  };
  const tone = status === "live" ? "success" : status === "error" ? "warning" : status === "ended" ? "neutral" : "primary";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatusBadge tone={tone}>{label[status]}</StatusBadge>
        <span className="text-xs text-muted-foreground">بث مباشر فقط، لا يُسجَّل</span>
      </div>
      {status === "elsewhere" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <span>الكاميرا معروضة الآن في نافذة أو صفحة أخرى.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => claimRef.current()}>
            اعرضها هنا
          </Button>
        </div>
      )}
      {hint && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <span>
            {hint === "noReply"
              ? "الطالب لا يرد. اطلب منه تحديث صفحة الامتحان، أو ربما أغلقها."
              : "وصل رد الطالب لكن الفيديو لا يمر عبر الشبكة. جرّب شبكة أخرى للطالب (مثل Wi-Fi بدل بيانات الهاتف)."}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => claimRef.current()}>
            حاول مرة أخرى
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <video ref={videoRef} autoPlay playsInline controls={false} className="aspect-video w-full rounded-2xl bg-black object-contain" aria-label="كاميرا الطالب" />
    </div>
  );
}
