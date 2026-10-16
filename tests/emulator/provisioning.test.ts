import { beforeAll, describe, expect, it } from "vitest";

// Set by `firebase emulators:exec` (FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST).
process.env.FIREBASE_PROJECT_ID ??= "demo-mo7ap-exam";

const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin-core");
const { provisionUser, setUserActive } = await import("@/lib/auth/provisioning");

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const ACTOR = "test-actor";

function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Turns a custom token into an ID token via the Auth emulator REST API. */
async function idTokenFor(uid: string): Promise<string> {
  const customToken = await getAdminAuth().createCustomToken(uid);
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = (await response.json()) as { idToken?: string };
  if (!body.idToken) throw new Error("emulator did not return idToken");
  return body.idToken;
}

describe("trusted provisioning (Auth + Firestore emulators)", () => {
  beforeAll(() => {
    if (!AUTH_HOST) throw new Error("Run via `npm run test:emulator`.");
    expect(PROJECT_ID).toBeTruthy();
  });

  it("creates a student with role claim, profile doc, audit log and setup link", async () => {
    const email = uniqueEmail("student");
    const result = await provisionUser({ email, displayName: "طالب تجريبي", role: "STUDENT", actorUid: ACTOR });

    expect(result.created).toBe(true);
    expect(result.passwordSetupLink).toContain("oobCode");

    const user = await getAdminAuth().getUser(result.uid);
    expect(user.customClaims).toMatchObject({ role: "STUDENT" });
    expect(user.disabled).toBe(false);

    const profile = await getAdminDb().collection("users").doc(result.uid).get();
    expect(profile.data()).toMatchObject({ role: "STUDENT", isActive: true, email });

    const logs = await getAdminDb().collection("auditLogs").where("targetId", "==", result.uid).get();
    expect(logs.docs.map((d) => d.data().action)).toContain("USER_PROVISIONED");
  });

  it("rejects an invalid role before touching any account", async () => {
    await expect(
      provisionUser({ email: uniqueEmail("bad"), displayName: "x", role: "ROOT" as never, actorUid: ACTOR }),
    ).rejects.toThrow("Invalid role");
  });

  it("revokes an existing session once the account is deactivated", async () => {
    const email = uniqueEmail("deactivate");
    const { uid } = await provisionUser({ email, displayName: "موقوف", role: "STUDENT", actorUid: ACTOR });
    const auth = getAdminAuth();

    const sessionCookie = await auth.createSessionCookie(await idTokenFor(uid), { expiresIn: 60 * 60 * 1000 });
    await expect(auth.verifySessionCookie(sessionCookie, true)).resolves.toMatchObject({ uid });

    await setUserActive({ email, active: false, actorUid: ACTOR });

    await expect(auth.verifySessionCookie(sessionCookie, true)).rejects.toThrow();
    const profile = await getAdminDb().collection("users").doc(uid).get();
    expect(profile.data()?.isActive).toBe(false);
  });

  it("invalidates old sessions when the role changes, so stale claims cannot be reused", async () => {
    const email = uniqueEmail("promote");
    const { uid } = await provisionUser({ email, displayName: "ترقية", role: "STUDENT", actorUid: ACTOR });
    const auth = getAdminAuth();

    const sessionCookie = await auth.createSessionCookie(await idTokenFor(uid), { expiresIn: 60 * 60 * 1000 });
    await expect(auth.verifySessionCookie(sessionCookie, true)).resolves.toBeTruthy();

    // Revocation is compared at one-second granularity. Wait so the revoke is strictly later.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const again = await provisionUser({ email, displayName: "ترقية", role: "ADMIN", actorUid: ACTOR });
    expect(again.created).toBe(false);

    await expect(auth.verifySessionCookie(sessionCookie, true)).rejects.toThrow();
    const user = await auth.getUser(uid);
    expect(user.customClaims).toMatchObject({ role: "ADMIN" });
  });
});
