/**
 * Maps Firebase Auth client error codes to Arabic messages.
 * Unknown codes get a generic message. Raw codes and stack traces are never shown.
 */
const MESSAGES: Record<string, string> = {
  // Same message for every credential failure so account existence is not revealed.
  "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth/invalid-login-credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth/wrong-password": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth/user-not-found": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth/invalid-email": "البريد الإلكتروني غير صالح.",
  "auth/user-disabled": "الحساب غير مفعل. تواصل مع المشرف.",
  "auth/too-many-requests": "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.",
  "auth/network-request-failed": "تعذر الاتصال بالخادم. تحقق من الإنترنت.",
};

export function authErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (MESSAGES[code]) return MESSAGES[code];
  }
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}
