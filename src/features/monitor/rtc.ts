/**
 * WebRTC signaling through Firestore: monitorSessions/{attemptId}.
 * Media flows peer to peer. Nothing is recorded or stored. STUN only: some mobile networks need a TURN server.
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export const SESSION_COLLECTION = "monitorSessions";
