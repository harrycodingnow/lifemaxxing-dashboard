// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseAppleDate, parseCalendarOutput } from "@/lib/calendar";

describe("parseAppleDate", () => {
  it("parses a fully-spelled AppleScript date with AM/PM", () => {
    const ts = parseAppleDate("Saturday, June 13, 2026 at 11:00:00 AM");
    expect(ts).not.toBeNull();
    const d = new Date(ts!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(13);
    expect(d.getHours()).toBe(11);
  });

  it("handles PM correctly", () => {
    const d = new Date(parseAppleDate("Friday, June 12, 2026 at 1:30:00 PM")!);
    expect(d.getHours()).toBe(13);
    expect(d.getMinutes()).toBe(30);
  });

  it("handles 12 AM (midnight) as hour 0", () => {
    const d = new Date(parseAppleDate("Wednesday, June 24, 2026 at 12:00:00 AM")!);
    expect(d.getHours()).toBe(0);
  });

  it("returns null on garbage", () => {
    expect(parseAppleDate("not a date")).toBeNull();
  });
});

describe("parseCalendarOutput", () => {
  const SAMPLE = [
    "HARRY 🤓\tMicrosoft Meeting\tFriday, June 12, 2026 at 8:30:00 AM\tFriday, June 12, 2026 at 9:30:00 AM\tmissing value",
    "HARRY 🤓\tShark Tank Taiwan錄製\tSaturday, June 13, 2026 at 11:00:00 AM\tSaturday, June 13, 2026 at 12:00:00 PM\tTaipei",
    "ANNY 🥸\tMalta\tFriday, June 12, 2026 at 12:00:00 AM\tMonday, June 15, 2026 at 11:59:59 PM\tmissing value",
  ].join("\n");

  it("parses tab-delimited lines into events", () => {
    const evs = parseCalendarOutput(SAMPLE);
    expect(evs).toHaveLength(3);
    const meeting = evs.find((e) => e.title === "Microsoft Meeting")!;
    expect(meeting.calendar).toBe("HARRY 🤓");
    expect(meeting.start_ts).not.toBeNull();
    expect(meeting.location).toBeNull(); // "missing value" normalized
  });

  it("preserves a real location", () => {
    const shark = parseCalendarOutput(SAMPLE).find((e) => e.title.startsWith("Shark"))!;
    expect(shark.location).toBe("Taipei");
  });

  it("flags multi-day events", () => {
    const malta = parseCalendarOutput(SAMPLE).find((e) => e.title === "Malta")!;
    expect(malta.multi_day).toBe(true);
  });

  it("sorts by start time ascending", () => {
    const evs = parseCalendarOutput(SAMPLE);
    const ts = evs.map((e) => e.start_ts!);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it("skips blank and malformed lines", () => {
    const evs = parseCalendarOutput("\n\nonly\ttwo\n" + SAMPLE);
    expect(evs).toHaveLength(3);
  });

  it("returns [] on empty input", () => {
    expect(parseCalendarOutput("")).toEqual([]);
  });
});
