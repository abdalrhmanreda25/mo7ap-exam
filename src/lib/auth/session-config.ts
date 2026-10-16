/**
 * Session cookie policy. Shared by the route handler (set/clear) and the
 * server session reader. Kept free of server-only imports so it is unit-testable.
 */
export const SESSION_COOKIE_NAME = "__session";

/** Five days. Firebase session cookies allow up to 14 days; shorter limits exposure. */
export const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

export function sessionCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Same-origin check for state-changing requests. SameSite=Lax already blocks
 * cross-site POSTs carrying the cookie; this adds an explicit CSRF check.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
