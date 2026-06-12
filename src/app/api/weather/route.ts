import { NextRequest, NextResponse } from "next/server";
import { getWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLACE = process.env.WEATHER_DEFAULT_PLACE || "Taipei";

// Cache per-place for 10 minutes (Open-Meteo is free but be polite).
const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const place = (new URL(req.url).searchParams.get("place") || DEFAULT_PLACE).trim();
  const key = place.toLowerCase();
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return NextResponse.json({ ...(hit.data as object), cached: true });
  }

  try {
    const weather = await getWeather(place);
    const payload = { available: true, ...weather };
    cache.set(key, { at: now, data: payload });
    return NextResponse.json({ ...payload, cached: false });
  } catch (e) {
    return NextResponse.json({ available: false, place, error: (e as Error).message }, { status: 200 });
  }
}
