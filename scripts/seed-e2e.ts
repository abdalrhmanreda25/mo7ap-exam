/**
 * Seeds emulator-only E2E accounts through the trusted provisioning path,
 * then sets passwords with the Admin SDK. Runs before Playwright, under tsx,
 * because Playwright's loader cannot load firebase-admin. Refuses to run
 * without the Auth emulator.
 */
import { ACCOUNTS, TEST_PASSWORD } from "../tests/e2e/accounts";
import { getAdminAuth } from "../src/lib/firebase/admin-core";
import { provisionUser, setUserActive } from "../src/lib/auth/provisioning";

async function main() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("E2E seed must run against the Auth emulator. Use `npm run test:e2e`.");
  }

  for (const account of Object.values(ACCOUNTS)) {
    const result = await provisionUser({
      email: account.email,
      displayName: account.name,
      role: account.role,
      actorUid: "e2e-seed",
    });
    await getAdminAuth().updateUser(result.uid, { password: TEST_PASSWORD });
  }

  await setUserActive({ email: ACCOUNTS.disabled.email, active: false, actorUid: "e2e-seed" });
  console.log("E2E accounts seeded.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
