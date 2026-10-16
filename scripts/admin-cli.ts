/**
 * Local admin CLI. The only path that creates accounts or assigns roles.
 *
 * Usage (from project root):
 *   npx tsx --env-file=.env.local scripts/admin-cli.ts provision --email a@b.c --name "اسم" --role STUDENT
 *   npx tsx --env-file=.env.local scripts/admin-cli.ts set-active --email a@b.c --active false
 *
 * The first ADMIN is provisioned the same way. There is no public signup.
 * Passwords are never passed on the command line. New accounts receive a
 * password-setup link printed once to this terminal.
 */
import { parseArgs } from "node:util";
import { isRole } from "../src/lib/auth/roles";
import { provisionUser, setUserActive } from "../src/lib/auth/provisioning";
import { getAdminAuth } from "../src/lib/firebase/admin-core";

const ACTOR_UID = "local-admin-cli";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      active: { type: "string" },
    },
    strict: true,
  });

  if (!values.email) throw new Error("--email is required");

  if (command === "provision") {
    if (!values.name) throw new Error("--name is required");
    if (!isRole(values.role)) throw new Error("--role must be ADMIN or STUDENT");

    const result = await provisionUser({
      email: values.email,
      displayName: values.name,
      role: values.role,
      actorUid: ACTOR_UID,
    });
    console.log(`uid=${result.uid} role=${result.role} created=${result.created}`);
    if (result.passwordSetupLink) {
      console.log("Password setup link (share privately, single use):");
      console.log(result.passwordSetupLink);
    }
    return;
  }

  if (command === "set-active") {
    if (values.active !== "true" && values.active !== "false") {
      throw new Error("--active must be true or false");
    }
    const result = await setUserActive({
      email: values.email,
      active: values.active === "true",
      actorUid: ACTOR_UID,
    });
    console.log(`uid=${result.uid} active=${result.active}`);
    return;
  }

  if (command === "reset-link") {
    const link = await getAdminAuth().generatePasswordResetLink(values.email.trim().toLowerCase());
    console.log("Password setup link (share privately, single use):");
    console.log(link);
    return;
  }

  throw new Error("Unknown command. Use: provision | set-active | reset-link");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
