import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isRole } from "@/lib/auth/roles";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  isSameOriginRequest,
  sessionCookieOptions,
} from "@/lib/auth/session-config";

const CreateSessionBody = z.object({
  idToken: z.string().min(1).max(4096),
});

/**
 * Exchanges a fresh Firebase ID token for an httpOnly session cookie.
 * The browser never sees the session cookie value from JavaScript.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ message: "طلب غير مسموح." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.includes("application/json") !== true) {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 415 });
  }

  const parsed = CreateSessionBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
  }

  const auth = getAdminAuth();
  let uid: string;
  try {
    // checkRevoked=true rejects disabled Auth users and revoked sessions.
    const decoded = await auth.verifyIdToken(parsed.data.idToken, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { message: "تعذر التحقق من الحساب. أعد تسجيل الدخول." },
      { status: 401 },
    );
  }

  const userRecord = await auth.getUser(uid);
  const role = userRecord.customClaims?.role;
  const profileSnap = await getAdminDb().collection("users").doc(uid).get();
  const profile = profileSnap.data();

  if (!isRole(role) || !profileSnap.exists || profile?.role !== role) {
    return NextResponse.json({ message: "الحساب غير مهيأ. تواصل مع المشرف." }, { status: 403 });
  }
  if (profile.isActive !== true || userRecord.disabled) {
    return NextResponse.json({ message: "الحساب غير مفعل. تواصل مع المشرف." }, { status: 403 });
  }

  const sessionCookie = await auth.createSessionCookie(parsed.data.idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    sessionCookie,
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );

  return NextResponse.json({ role });
}

/** Clears the session cookie. Does not revoke other devices' sessions. */
export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ message: "طلب غير مسموح." }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(process.env.NODE_ENV === "production"),
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
