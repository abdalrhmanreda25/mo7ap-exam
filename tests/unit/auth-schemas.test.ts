import { describe, expect, it } from "vitest";
import { loginSchema, forgotPasswordSchema } from "@/features/auth/schemas";
import { authErrorMessage } from "@/features/auth/errors";

describe("loginSchema", () => {
  it("trims and accepts a valid email with a password", () => {
    const result = loginSchema.safeParse({ email: "  student@example.com ", password: "x" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("student@example.com");
  });

  it("rejects an invalid email and an empty password", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("rejects a malformed email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "@@" }).success).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("maps known Firebase codes to Arabic text", () => {
    expect(authErrorMessage({ code: "auth/invalid-credential" })).toContain("كلمة المرور");
  });

  it("returns a generic message and never leaks unknown codes", () => {
    const message = authErrorMessage({ code: "auth/internal-error-xyz" });
    expect(message).not.toContain("auth/");
    expect(authErrorMessage(new Error("boom"))).not.toContain("boom");
  });
});
