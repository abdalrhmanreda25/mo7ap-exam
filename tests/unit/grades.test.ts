import { describe, expect, it } from "vitest";
import { DEFAULT_GRADE, GRADES, gradeLabel, gradeOf } from "@/lib/grades";

describe("school years", () => {
  it("lists prep and secondary years in order", () => {
    expect(GRADES.map((g) => g.id)).toEqual(["prep1", "prep2", "prep3", "sec1", "sec2", "sec3"]);
    expect(gradeLabel("sec3")).toBe("الصف الثالث الثانوي");
  });

  it("treats data saved before years existed as third secondary", () => {
    expect(DEFAULT_GRADE).toBe("sec3");
    expect(gradeOf(undefined)).toBe("sec3");
    expect(gradeOf("not-a-grade")).toBe("sec3");
    expect(gradeOf("prep2")).toBe("prep2");
  });
});
