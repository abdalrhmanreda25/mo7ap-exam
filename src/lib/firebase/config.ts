/**
 * Public Firebase web configuration. Safe for the browser.
 * Never add secrets here; secrets belong in server-only env vars.
 *
 * Property access uses literal `process.env.NEXT_PUBLIC_*` names so Next.js
 * can inline them at build time.
 */
export interface PublicFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

export function getPublicFirebaseConfig(): PublicFirebaseConfig {
  const values = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const missing = REQUIRED_KEYS.filter((key) => {
    const field = key.replace("NEXT_PUBLIC_FIREBASE_", "").toLowerCase();
    const camel = field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    return !values[camel as keyof typeof values];
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing public Firebase config: ${missing.join(", ")}. Copy .env.example to .env.local.`,
    );
  }

  return values as PublicFirebaseConfig;
}

export function shouldUseAuthEmulator(): boolean {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
}

export const AUTH_EMULATOR_URL =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099";
