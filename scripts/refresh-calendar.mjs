#!/usr/bin/env node
// Refresh the Apple Calendar cache for the lifemaxxing dashboard using the
// EventKit helper (scripts/caldump.app). Fast + reliable (no AppleScript hang).
//
//     npm run calendar:refresh        # 30-day window
//     npm run calendar:refresh -- 60  # custom window
//
// Writes data/calendar-cache.json, which /api/calendar falls back to. Wire to
// launchd/cron for periodic refresh. Read-only: never edits calendars.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CALDUMP = path.join(ROOT, "scripts", "caldump.app", "Contents", "MacOS", "caldump");
const CACHE_PATH = path.join(ROOT, "data", "calendar-cache.json");
const DAYS = Number(process.argv[2]) || 30;

if (!fs.existsSync(CALDUMP)) {
  console.error(`caldump helper not found at ${CALDUMP}\nBuild it: npm run calendar:build`);
  process.exit(1);
}

const r = spawnSync(CALDUMP, [String(DAYS)], { encoding: "utf8", timeout: 20_000 });
if (r.status === 2) {
  console.error("Calendar access not granted. Run: npm run calendar:grant");
  process.exit(2);
}
if (r.status !== 0) {
  console.error(`caldump failed (exit ${r.status}): ${r.stderr || r.error || ""}`);
  process.exit(1);
}

let rows;
try {
  rows = JSON.parse(r.stdout || "[]");
} catch {
  console.error("caldump returned invalid JSON");
  process.exit(1);
}

const events = rows
  .map((e) => {
    const spanDays = (e.end_ts - e.start_ts) / 86400000;
    return {
      calendar: e.calendar,
      title: e.title || "(untitled)",
      start: new Date(e.start_ts).toString(),
      end: new Date(e.end_ts).toString(),
      start_ts: e.start_ts,
      end_ts: e.end_ts,
      all_day: e.all_day,
      multi_day: spanDays > 1,
      location: e.location && e.location !== "" ? e.location : null,
    };
  })
  .sort((a, b) => (a.start_ts ?? Infinity) - (b.start_ts ?? Infinity));

fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
fs.writeFileSync(CACHE_PATH, JSON.stringify({ at: Date.now(), days: DAYS, events }, null, 2));
console.log(`✓ Wrote ${events.length} events (next ${DAYS}d) → ${CACHE_PATH}`);
