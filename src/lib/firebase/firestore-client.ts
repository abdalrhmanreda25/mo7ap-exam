import { getFirestore, type Firestore } from "firebase/firestore";
import { getClientApp } from "./client";

let cached: Firestore | null = null;

/** Browser Firestore for live signaling only. Rules restrict it to the student's own session and the admin. */
export function getClientDb(): Firestore {
  if (!cached) cached = getFirestore(getClientApp());
  return cached;
}
