import { describe, expect, it } from "vitest";
import { splitBidiRuns } from "@/lib/domain/bidi";

const ltr = (text: string) => splitBidiRuns(text).filter((r) => r.ltr).map((r) => r.text);

describe("splitBidiRuns", () => {
  it("leaves text without Arabic as one run", () => {
    expect(splitBidiRuns("[Ar] 3d³")).toEqual([{ text: "[Ar] 3d³", ltr: false }]);
  });

  it("isolates formulas and keeps sentence punctuation outside", () => {
    expect(ltr("التركيب X⁴⁺ : [Ar] 3d¹ و Y⁶⁺ : [Ar] 3d². من مميزات")).toEqual(["X⁴⁺ : [Ar] 3d¹", "Y⁶⁺ : [Ar] 3d²"]);
    expect(ltr("ينتهى بـ ns^(n-3) , (n-1)d^(2n). أى")).toEqual(["ns^(n-3) , (n-1)d^(2n)"]);
    expect(ltr("العنصر (A): 2 ، العنصر (B): 1")).toEqual(["(A): 2", "(B): 1"]);
  });

  it("keeps the full text when joined", () => {
    const text = "انتقالى ، [Ar] 3d¹⁰";
    expect(splitBidiRuns(text).map((r) => r.text).join("")).toBe(text);
  });
});
