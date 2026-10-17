"use client";

import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/firestore-client";
import { RTC_CONFIG, SESSION_COLLECTION } from "../rtc";
import { StatusBadge } from "@/components/layout/page-header";

/** Admin side. Answers the student's offer and shows the live camera. Nothing is recorded. */
export function CameraViewer({ attemptId }: { attemptId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"waiting" | "live" | "ended">("waiting");

  useEffect(() => {
    const db = getClientDb();
    const sessionRef = doc(db, SESSION_COLLECTION, attemptId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const unsubs: (() => void)[] = [];
    let answered = false;

    pc.ontrack = (event) => {
      if (videoRef.current) videoRef.current.srcObject = event.streams[0];
      setStatus("live");
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) void addDoc(collection(sessionRef, "adminCandidates"), event.candidate.toJSON());
    };

    unsubs.push(
      onSnapshot(sessionRef, async (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.status === "ended") setStatus("ended");
        if (data.offer && !data.answer && !answered) {
          answered = true;
          await pc.setRemoteDescription(data.offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await updateDoc(sessionRef, { answer: { type: answer.type, sdp: answer.sdp }, updatedAt: serverTimestamp() });
        }
      }),
    );
    unsubs.push(
      onSnapshot(collection(sessionRef, "studentCandidates"), (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") void pc.addIceCandidate(change.doc.data());
        });
      }),
    );

    return () => {
      unsubs.forEach((u) => u());
      pc.close();
    };
  }, [attemptId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatusBadge tone={status === "live" ? "success" : status === "ended" ? "neutral" : "warning"}>
          {status === "live" ? "مباشر" : status === "ended" ? "انتهت المتابعة" : "بانتظار الاتصال"}
        </StatusBadge>
        <span className="text-xs text-muted-foreground">بث مباشر فقط، لا يُسجَّل</span>
      </div>
      <video ref={videoRef} autoPlay playsInline controls={false} className="aspect-video w-full rounded-2xl bg-black object-contain" aria-label="كاميرا الطالب" />
    </div>
  );
}
