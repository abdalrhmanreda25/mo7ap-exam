"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getClientAuth } from "@/lib/firebase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    setPending(true);
    try {
      // Clear the server cookie first. Then drop the client Firebase session.
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) throw new Error("sign-out-failed");
      await signOut(getClientAuth());
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("تعذر تسجيل الخروج. حاول مرة أخرى.");
      setPending(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSignOut} disabled={pending}>
      {pending ? "جارٍ الخروج..." : "تسجيل الخروج"}
    </Button>
  );
}
