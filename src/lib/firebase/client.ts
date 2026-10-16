import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  AUTH_EMULATOR_URL,
  getPublicFirebaseConfig,
  shouldUseAuthEmulator,
} from "./config";

/**
 * Browser-side Firebase client. Used only for sign-in, sign-out and password
 * reset. Every data access and every privileged action is still enforced on
 * the server, so nothing here is an authorization boundary.
 */
let cachedAuth: Auth | null = null;

export function getClientApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp(getPublicFirebaseConfig());
}

export function getClientAuth(): Auth {
  if (cachedAuth) return cachedAuth;

  const auth = getAuth(getClientApp());
  if (shouldUseAuthEmulator()) {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  }

  cachedAuth = auth;
  return auth;
}
