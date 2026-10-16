import { describe, expect, it } from "vitest";
import { homePathFor, isRole, safeNextPath } from "@/lib/auth/roles";

describe("isRole", () => {
  it("accepts only known roles", () => {
    expect(isRole("ADMIN")).toBe(true);
    expect(isRole("STUDENT")).toBe(true);
  });

  it("rejects unknown, lowercase, and non-string values", () => {
    expect(isRole("SUPERUSER")).toBe(false);
    expect(isRole("admin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole({ role: "ADMIN" })).toBe(false);
  });
});

describe("homePathFor", () => {
  it("routes each role to its own area", () => {
    expect(homePathFor("ADMIN")).toBe("/admin");
    expect(homePathFor("STUDENT")).toBe("/dashboard");
  });
});

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/admin/exams?x=1")).toBe("/admin/exams?x=1");
  });

  it("blocks open redirects", () => {
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("dashboard")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("")).toBeNull();
  });
});
