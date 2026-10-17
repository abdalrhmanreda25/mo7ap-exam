import { describe, expect, it } from "vitest";
import { formatRemaining } from "@/features/attempts/time";
import { isDeadlinePassed } from "@/lib/domain/state";

describe("timer formatting", () => {
  it("formats minutes and seconds under an hour", () => {
    expect(formatRemaining(90_000)).toBe("01:30");
    expect(formatRemaining(0)).toBe("00:00");
  });

  it("adds hours at one hour and above", () => {
    expect(formatRemaining(3_600_000)).toBe("1:00:00");
    expect(formatRemaining(3_725_000)).toBe("1:02:05");
  });

  it("never shows negative time after the deadline", () => {
    expect(formatRemaining(-5_000)).toBe("00:00");
  });

  it("floors partial seconds, so the display never shows time that is not there", () => {
    expect(formatRemaining(999)).toBe("00:00");
    expect(formatRemaining(1_999)).toBe("00:01");
  });
});

describe("deadline expiry", () => {
  it("treats the exact deadline instant as expired", () => {
    expect(isDeadlinePassed(1000, 1000)).toBe(true);
    expect(isDeadlinePassed(1000, 999)).toBe(false);
  });
});
