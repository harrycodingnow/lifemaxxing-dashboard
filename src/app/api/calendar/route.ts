import { NextRequest, NextResponse } from "next/server";
import { getCalendarEvents, CALENDARS } from "@/lib/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Short in-memory cache — Calendar.app + osascript is a ~1-2s round trip.
let cache: { at: number; days: number; data: unknown } | null = null;
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(60, parseInt(url.searchParams.get("days") || "14", 10)));

  const now = Date.now();
  if (cache && cache.days === days && now - cache.at < TTL_MS) {
    return NextResponse.json({ ...(cache.data as object), cached: true });
  }

  try {
    const { events, source, stale_ts } = await getCalendarEvents({ days });
    const payload = {
      available: true,
      source,                 // 'live' | 'cache'
      stale_ts: stale_ts ?? null,
      calendars: CALENDARS,
      days,
      events,
      count: events.length,
    };
    cache = { at: now, days, data: payload };
    return NextResponse.json({ ...payload, cached: false });
  } catch (e) {
    const msg = (e as Error).message || "calendar unavailable";
    const permission = /not authorized|Application isn.t running|-1743|access|timeout/i.test(msg);
    return NextResponse.json({
      available: false,
      calendars: CALENDARS,
      days,
      events: [],
      count: 0,
      error: msg,
      permission_hint: permission
        ? "Calendar access not granted to the server. Run `npm run calendar:refresh` from your terminal once (approve the macOS prompt), then it works via cache. Or grant Automation→Calendar to node in System Settings → Privacy & Security."
        : null,
    });
  }
}
