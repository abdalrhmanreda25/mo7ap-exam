import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/roles";

/** The site has no landing page: visitors go to login, signed-in users to their own home. */
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome(): Promise<null> {
  await connection();
  const user = await getSessionUser();
  redirect(user ? homePathFor(user.role) : "/login");
}
