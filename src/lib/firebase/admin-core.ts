import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Admin SDK bootstrap. Bypasses Firestore Security Rules, so every caller must
 * validate identity, role, ownership and state itself.
 *
 * Credentials resolution order:
 *  1. GOOGLE_APPLICATION_CREDENTIALS (file path, server only, outside repo).
 *  2. Application Default Credentials (Cloud Run / App Hosting / gcloud auth).
 *  3. Emulators, when FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST are set.
 *
 * This module has no server-only guard so the CLI scripts can use it.
 * The app-facing wrapper in admin.ts adds the guard.
 */
let adminApp: App | null = null;

/**
 * Service account from one of two server-only sources:
 *  1. FIREBASE_SERVICE_ACCOUNT_JSON: the JSON itself, or base64 of it. Use this on Vercel.
 *  2. GOOGLE_APPLICATION_CREDENTIALS: path to the JSON file. Use this on a local machine.
 * With neither set, Application Default Credentials apply.
 */
function credentialOptions(): { credential?: ReturnType<typeof cert> } {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    const raw = inline.trim().startsWith("{") ? inline : Buffer.from(inline, "base64").toString("utf8");
    return { credential: cert(JSON.parse(raw)) };
  }
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) return { credential: cert(keyPath) };
  return {};
}

export function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return existing;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("Missing FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID).");
  }

  adminApp = initializeApp({
    projectId,
    ...credentialOptions(),
  });
  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
