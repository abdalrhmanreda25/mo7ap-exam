import { describe, expect, it } from "vitest";
import { isSameOriginRequest, sessionCookieOptions, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-config";

function requestWith(origin: string | null, url = "https://app.example/api/auth/session") {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request(url, { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("accepts matching origin", () => {
    expect(isSameOriginRequest(requestWith("https://app.example"))).toBe(true);
  });

  it("rejects cross-origin and missing origin", () => {
    expect(isSameOriginRequest(requestWith("https://evil.example"))).toBe(false);
    expect(isSameOriginRequest(requestWith(null))).toBe(false);
    expect(isSameOriginRequest(requestWith("not a url"))).toBe(false);
  });

  it("rejects same host on a different scheme or port", () => {
    expect(isSameOriginRequest(requestWith("http://app.example"))).toBe(false);
    expect(isSameOriginRequest(requestWith("https://app.example:8443"))).toBe(false);
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly, lax, and secure in production", () => {
    const options = sessionCookieOptions(true);
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(options.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it("drops the secure flag outside production so local http works", () => {
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});
