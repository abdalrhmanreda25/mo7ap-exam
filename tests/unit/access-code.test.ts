import { describe, expect, it } from "vitest";
import { ACCESS_CODE_ALPHABET, makeAccessCode, normalizeAccessCode } from "@/lib/domain/access-code";

describe("access codes", () => {
  it("makes 6 characters without look-alike characters", () => {
    for (let i = 0; i < 200; i++) expect(makeAccessCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(ACCESS_CODE_ALPHABET).not.toMatch(/[01IOL]/);
  });

  it("normalizes case, spaces, and dashes", () => {
    expect(normalizeAccessCode(" ab3-k 9z ")).toBe("AB3K9Z");
    expect(normalizeAccessCode("")).toBe("");
  });
});
