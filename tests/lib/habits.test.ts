// @vitest-environment node
import { describe, it, expect } from "vitest";
import { currentStreak, longestStreak, doneInLastN, shiftDay, localDay } from "@/lib/habits";

describe("habits lib", () => {
  it("shiftDay moves by N days across month boundaries", () => {
    expect(shiftDay("2026-06-01", -1)).toBe("2026-05-31");
    expect(shiftDay("2026-06-30", 1)).toBe("2026-07-01");
  });

  it("localDay converts ts+tz to YYYY-MM-DD", () => {
    // 2026-06-01T00:30:00Z at tz=-480 (UTC+8) -> local 08:30 same day
    const ts = Date.UTC(2026, 5, 1, 0, 30);
    expect(localDay(ts, -480)).toBe("2026-06-01");
  });

  it("currentStreak counts consecutive done days ending today", () => {
    const done = new Set(["2026-06-01", "2026-05-31", "2026-05-30"]);
    expect(currentStreak(done, new Set(), "2026-06-01")).toBe(3);
  });

  it("currentStreak counts from yesterday when today is unlogged (not broken)", () => {
    const done = new Set(["2026-05-31", "2026-05-30"]);
    expect(currentStreak(done, new Set(), "2026-06-01")).toBe(2);
  });

  it("a skip today breaks the from-yesterday grace (streak stays 0 if today skipped)", () => {
    const done = new Set(["2026-05-31"]);
    const skip = new Set(["2026-06-01"]);
    // today is skipped, so cursor stays on today which is not in done -> 0
    expect(currentStreak(done, skip, "2026-06-01")).toBe(0);
  });

  it("a gap breaks the streak", () => {
    const done = new Set(["2026-06-01", "2026-05-30"]); // missing 05-31
    expect(currentStreak(done, new Set(), "2026-06-01")).toBe(1);
  });

  it("longestStreak finds the longest run anywhere", () => {
    const done = new Set(["2026-01-01", "2026-01-02", "2026-01-03", "2026-02-01", "2026-02-02"]);
    expect(longestStreak(done)).toBe(3);
  });

  it("doneInLastN counts done days within the window", () => {
    const done = new Set(["2026-06-01", "2026-05-30", "2026-05-26"]);
    // window i=0..6 spans 2026-06-01 back to 2026-05-26 inclusive → all 3 fall in range
    expect(doneInLastN(done, "2026-06-01", 7)).toBe(3);
    // a 4-day window only reaches back to 2026-05-29 → only 06-01 and 05-30 count
    expect(doneInLastN(done, "2026-06-01", 4)).toBe(2);
  });
});
