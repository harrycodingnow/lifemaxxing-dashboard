// Habit streak math, shared between the /api/habits route and tests.

export type HabitLogLite = { day: string; status: string };

/** Local YYYY-MM-DD for a given epoch-ms timestamp + tz offset (minutes east of UTC, as Date.getTimezoneOffset negated). */
export function localDay(ts: number, tzOffsetMin: number): string {
  const d = new Date(ts - tzOffsetMin * 60_000);
  return d.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD string by `delta` days. */
export function shiftDay(ymd: string, delta: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Current streak: count back from today over consecutive days that have a
 * status='done' log. If today has no log yet, start counting from yesterday
 * (so a streak isn't "broken" just because you haven't logged today). 'skip'
 * days break the streak.
 */
export function currentStreak(doneDays: Set<string>, skipDays: Set<string>, todayYmd: string): number {
  let cursor = todayYmd;
  // If today is neither done nor skipped, drop to yesterday before counting.
  if (!doneDays.has(todayYmd) && !skipDays.has(todayYmd)) {
    cursor = shiftDay(todayYmd, -1);
  }
  let streak = 0;
  while (doneDays.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Longest run of consecutive done days anywhere in the history. */
export function longestStreak(doneDays: Set<string>): number {
  if (doneDays.size === 0) return 0;
  const sorted = Array.from(doneDays).sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (shiftDay(sorted[i - 1], 1) === sorted[i]) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

/** Count of done days within the last `n` days (inclusive of today). */
export function doneInLastN(doneDays: Set<string>, todayYmd: string, n: number): number {
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (doneDays.has(shiftDay(todayYmd, -i))) count++;
  }
  return count;
}
