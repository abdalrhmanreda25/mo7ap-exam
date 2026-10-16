import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/roles";

export default function RootPage() {
  return (
    <Suspense fallback={null}>
      <RootRedirect />
    </Suspense>
  );
}

async function RootRedirect() {
  const user = await getSessionUser();
  redirect(user ? homePathFor(user.role) : "/login");
  return null;
}
