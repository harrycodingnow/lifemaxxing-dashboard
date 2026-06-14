// @vitest-environment node
//
// Coverage for the today-focused weather payload (range + hourly precip).
// Open-Meteo + the geocoding API are stubbed with MSW.
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { getWeather } from "@/lib/weather";
import { server } from "../setup";

function stubGeocode() {
  server.use(
    http.get("https://geocoding-api.open-meteo.com/v1/search", () =>
      HttpResponse.json({
        results: [
          { name: "Taipei", country: "Taiwan", latitude: 25.05, longitude: 121.53, timezone: "Asia/Taipei" },
        ],
      }),
    ),
  );
}

// Build an Open-Meteo-shaped forecast response. `hourlyTimes` are local-time
// strings (timezone=auto). The first 24 cover "today" in the location's
// timezone, the next 24 cover tomorrow.
function forecastFixture(opts: {
  todayDate?: string;
  tmrwDate?: string;
  hourlyPops?: (number | null)[];
  hourlyTemps?: number[];
  noHourly?: boolean;
} = {}) {
  const today = opts.todayDate ?? "2026-06-14";
  const tmrw = opts.tmrwDate ?? "2026-06-15";
  const pops = opts.hourlyPops ?? Array.from({ length: 48 }, (_, i) => (i < 24 ? 10 + i * 2 : 5));
  const temps = opts.hourlyTemps ?? Array.from({ length: 48 }, (_, i) => 25 + (i % 24) * 0.1);
  const hourlyTimes = Array.from({ length: 48 }, (_, i) => {
    const date = i < 24 ? today : tmrw;
    const h = String(i % 24).padStart(2, "0");
    return `${date}T${h}:00`;
  });
  return {
    timezone: "Asia/Taipei",
    current: {
      temperature_2m: 28.4,
      relative_humidity_2m: 74,
      apparent_temperature: 31.1,
      weather_code: 2,
      wind_speed_10m: 12,
      is_day: 1,
    },
    hourly: opts.noHourly
      ? undefined
      : {
          time: hourlyTimes,
          temperature_2m: temps,
          precipitation_probability: pops,
        },
    daily: {
      time: [today, tmrw, "2026-06-16"],
      weather_code: [2, 61, 0],
      temperature_2m_max: [30.4, 28.1, 31.8],
      temperature_2m_min: [24.2, 23.3, 23.9],
      precipitation_probability_max: [55, 80, 10],
    },
  };
}

describe("getWeather — today range + hourly precip", () => {
  it("returns today's high/low + 24 hourly entries with rounded values", async () => {
    stubGeocode();
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(forecastFixture()),
      ),
    );
    const w = await getWeather("Taipei");
    expect(w.today.date).toBe("2026-06-14");
    expect(w.today.t_max).toBe(30); // 30.4 rounds to 30
    expect(w.today.t_min).toBe(24); // 24.2 rounds to 24
    expect(w.today.max_precip_prob).toBe(55);
    expect(w.today.hourly).toHaveLength(24);
    expect(w.today.hourly[0].hour).toBe(0);
    expect(w.today.hourly[23].hour).toBe(23);
    expect(w.today.hourly[0].iso).toBe("2026-06-14T00:00");
    expect(w.today.hourly[0].precip_prob).toBe(10);
    expect(w.today.hourly[23].precip_prob).toBe(56); // 10 + 23*2
  });

  it("does not include tomorrow's hours in today.hourly", async () => {
    stubGeocode();
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(forecastFixture()),
      ),
    );
    const w = await getWeather("Taipei");
    for (const h of w.today.hourly) {
      expect(h.iso.startsWith("2026-06-14")).toBe(true);
    }
  });

  it("rounds hourly temps to integers", async () => {
    stubGeocode();
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(
          forecastFixture({ hourlyTemps: [25.6, 24.4, 24.5, ...Array.from({ length: 45 }, () => 25)] }),
        ),
      ),
    );
    const w = await getWeather("Taipei");
    expect(w.today.hourly[0].temp).toBe(26); // 25.6 → 26
    expect(w.today.hourly[1].temp).toBe(24); // 24.4 → 24
    expect(w.today.hourly[2].temp).toBe(25); // 24.5 → 25 (banker would say 24, JS Math.round → 25)
    expect(Number.isInteger(w.today.hourly[0].temp)).toBe(true);
  });

  it("treats null precipitation_probability as null (not 0)", async () => {
    stubGeocode();
    const pops: (number | null)[] = Array.from({ length: 48 }, (_, i) => (i === 5 ? null : 10));
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(forecastFixture({ hourlyPops: pops })),
      ),
    );
    const w = await getWeather("Taipei");
    expect(w.today.hourly[5].precip_prob).toBeNull();
    expect(w.today.hourly[4].precip_prob).toBe(10);
  });

  it("falls back gracefully when API returns no hourly data", async () => {
    stubGeocode();
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(forecastFixture({ noHourly: true })),
      ),
    );
    const w = await getWeather("Taipei");
    expect(w.today.hourly).toEqual([]);
    // High/low for today still flow from the `daily` block.
    expect(w.today.t_max).toBe(30);
    expect(w.today.t_min).toBe(24);
    expect(w.today.max_precip_prob).toBe(55);
  });

  it("still returns the 5-day daily array for compatibility", async () => {
    stubGeocode();
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(forecastFixture()),
      ),
    );
    const w = await getWeather("Taipei");
    expect(w.daily.length).toBeGreaterThanOrEqual(1);
    expect(w.daily[0].date).toBe("2026-06-14");
    expect(w.daily[0].t_max).toBe(30);
  });
});
