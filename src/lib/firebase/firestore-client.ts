import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { getClientApp, getClientAuth } from "./client";
import { shouldUseAuthEmulator } from "./config";

let cached: Firestore | null = null;

/**
 * Browser Firestore for live signaling only. Rules restrict it to the student's own session and the admin.
 * With NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true it must talk to the emulator, never the real project.
 */
export function getClientDb(): Firestore {
  if (cached) return cached;
  // Auth must be registered before Firestore starts, or Firestore sends requests without the user's token.
  getClientAuth();
  const db = getFirestore(getClientApp());
  if (shouldUseAuthEmulator()) {
    connectFirestoreEmulator(db, "127.0.0.1", 8181);
  }
  cached = db;
  return db;
}
