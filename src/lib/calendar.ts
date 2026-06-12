import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Apple Calendar (macOS Calendar.app) reader via osascript.
//
// Only reads the user's chosen calendars (HARRY 🤓 / ANNY 🥸 by default).
// Read-only: this never creates/edits/deletes events. macOS will prompt for
// Calendar automation permission the first time the host process runs this.
//
// TCC gotcha: a long-lived `next start` node server may not be able to surface
// the macOS Automation permission prompt (no controlling terminal), so the
// osascript call hangs. To stay robust we (a) keep the live timeout short and
// (b) fall back to a cache file written by scripts/refresh-calendar.mjs, which
// you run from an already-authorized shell / cron.

export const CALENDARS = ["HARRY 🤓", "ANNY 🥸"];
export const CACHE_PATH = path.join(process.cwd(), "data", "calendar-cache.json");

export type CalEvent = {
  calendar: string;
  title: string;
  start: string; // ISO-ish local string
  end: string;
  start_ts: number | null; // epoch ms (parsed, best-effort)
  end_ts: number | null;
  all_day: boolean;
  multi_day: boolean;
  location: string | null;
};

const FMT = (d: Date) => {
  // AppleScript parses fully-spelled strings most reliably.
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
};

function escapeForAppleScriptList(names: string[]): string {
  // Build {"a", "b"} with quotes escaped.
  return "{" + names.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(", ") + "}";
}

function buildScript(start: Date, end: Date, calendars: string[]): string {
  return `
set startDate to date "${FMT(start)}"
set endDate to date "${FMT(end)}"
set output to ""
tell application "Calendar"
    repeat with calName in ${escapeForAppleScriptList(calendars)}
        try
            set calEvents to every event of calendar (contents of calName) whose start date ≥ startDate and start date < endDate
            repeat with ev in calEvents
                set loc to ""
                try
                    set loc to (location of ev as text)
                end try
                set output to output & (contents of calName) & "\\t" & (summary of ev) & "\\t" & ((start date of ev) as string) & "\\t" & ((end date of ev) as string) & "\\t" & loc & linefeed
            end repeat
        end try
    end repeat
end tell
return output`;
}

// Parse the AppleScript date string (e.g. "Saturday, June 13, 2026 at 11:00:00 AM").
export function parseAppleDate(s: string): number | null {
  const m = s.match(/([A-Za-z]+) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/);
  if (!m) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  const months: Record<string, number> = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
  };
  const mon = months[m[1]];
  if (mon == null) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const sec = parseInt(m[6], 10);
  const ap = m[7];
  if (ap === "PM" && hour < 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;
  return new Date(year, mon, day, hour, min, sec).getTime();
}

export function parseCalendarOutput(raw: string): CalEvent[] {
  const events: CalEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 4) continue;
    const [calendar, title, start, end, location = ""] = parts;
    const start_ts = parseAppleDate(start);
    const end_ts = parseAppleDate(end);
    // All-day: starts at midnight and spans a whole number of days.
    let all_day = false;
    let multi_day = false;
    if (start_ts != null && end_ts != null) {
      const s = new Date(start_ts), e = new Date(end_ts);
      const midnightStart = s.getHours() === 0 && s.getMinutes() === 0;
      const spanDays = (end_ts - start_ts) / 86400_000;
      all_day = midnightStart && spanDays >= 1 && Number.isInteger(Math.round(spanDays));
      multi_day = spanDays > 1;
    }
    events.push({
      calendar,
      title: title || "(untitled)",
      start,
      end,
      start_ts,
      end_ts,
      all_day,
      multi_day,
      location: location && location !== "missing value" ? location : null,
    });
  }
  // Sort by start time, undated last.
  events.sort((a, b) => (a.start_ts ?? Infinity) - (b.start_ts ?? Infinity));
  return events;
}

// Preferred reader: the compiled EventKit helper (scripts/caldump). Uses an
// indexed predicate so it's fast and never hangs (unlike AppleScript `whose`).
// Emits a JSON array. Exit code 2 = calendar access not granted.
export const CALDUMP_PATH = path.join(process.cwd(), "scripts", "caldump.app", "Contents", "MacOS", "caldump");

type CaldumpRow = { calendar: string; title: string; start_ts: number; end_ts: number; all_day: boolean; location: string | null };

export function readCalendarEventsEventKit(opts: { days?: number; timeoutMs?: number } = {}): Promise<CalEvent[]> {
  const days = opts.days ?? 14;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CALDUMP_PATH)) return reject(new Error("caldump helper not built"));
    const child = spawn(CALDUMP_PATH, [String(days)]);
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`eventkit read timeout after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 2) return reject(new Error("calendar access denied (EventKit). Run: npm run calendar:grant"));
      if (code !== 0) return reject(new Error(`caldump exit ${code}: ${err || out}`));
      let rows: CaldumpRow[];
      try { rows = JSON.parse(out || "[]"); } catch { return reject(new Error("caldump returned invalid JSON")); }
      const events: CalEvent[] = rows.map((r) => {
        const spanDays = (r.end_ts - r.start_ts) / 86400_000;
        return {
          calendar: r.calendar,
          title: r.title || "(untitled)",
          start: new Date(r.start_ts).toString(),
          end: new Date(r.end_ts).toString(),
          start_ts: r.start_ts,
          end_ts: r.end_ts,
          all_day: r.all_day,
          multi_day: spanDays > 1,
          location: r.location && r.location !== "" ? r.location : null,
        };
      });
      events.sort((a, b) => (a.start_ts ?? Infinity) - (b.start_ts ?? Infinity));
      resolve(events);
    });
  });
}

// Legacy AppleScript reader. Kept as a fallback, but note Calendar.app's
// `whose start date` predicate can hang on calendars with recurring/subscribed
// events — prefer readCalendarEventsEventKit.
export function readCalendarEvents(opts: { days?: number; calendars?: string[]; timeoutMs?: number } = {}): Promise<CalEvent[]> {
  const days = opts.days ?? 14;
  const calendars = opts.calendars ?? CALENDARS;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(start.getTime() + days * 86400_000);
  const script = buildScript(start, end, calendars);

  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-e", script]);
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`calendar read timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`osascript exit ${code}: ${err || out}`));
      resolve(parseCalendarOutput(out));
    });
  });
}

// Write the cache file (called by scripts/refresh-calendar.mjs from an
// authorized shell, or opportunistically after a successful live read).
export function writeCalendarCache(events: CalEvent[], days: number) {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ at: Date.now(), days, events }, null, 2));
  } catch {
    /* best-effort */
  }
}

export function readCalendarCache(): { at: number; days: number; events: CalEvent[] } | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.events)) return parsed;
    return null;
  } catch {
    return null;
  }
}

// Orchestrator used by the API route. Order of preference:
//   1. EventKit helper (fast, no hang) — the right answer when access is granted
//   2. AppleScript reader (legacy fallback; can be slow)
//   3. cache file written by `npm run calendar:refresh`
export async function getCalendarEvents(
  opts: { days?: number } = {},
): Promise<{ events: CalEvent[]; source: "eventkit" | "applescript" | "cache"; stale_ts?: number }> {
  const days = opts.days ?? 14;
  // 1. EventKit
  try {
    const events = await readCalendarEventsEventKit({ days, timeoutMs: 8_000 });
    writeCalendarCache(events, days);
    return { events, source: "eventkit" };
  } catch {
    /* fall through */
  }
  // 2. AppleScript (short timeout so a hang doesn't wedge the request)
  try {
    const events = await readCalendarEvents({ days, timeoutMs: 6_000 });
    writeCalendarCache(events, days);
    return { events, source: "applescript" };
  } catch (liveErr) {
    // 3. cache
    const cached = readCalendarCache();
    if (cached) return { events: cached.events, source: "cache", stale_ts: cached.at };
    throw liveErr;
  }
}
