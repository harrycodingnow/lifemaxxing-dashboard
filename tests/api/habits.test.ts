// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/habits/route";
import { PATCH, DELETE } from "@/app/api/habits/[id]/route";
import { POST as LOG_POST, GET as LOG_GET } from "@/app/api/habits/log/route";
import { makeRequest, jsonOf } from "../helpers/makeRequest";
import { getDb, seedDb } from "../helpers/db";

function ctx(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe("habits routes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  it("GET computes streak/longest/today_status per habit", async () => {
    seedDb({
      habits: [{ name: "meditate" }],
      habit_logs: [
        { habit_id: 1, day: "2026-06-01", status: "done" },
        { habit_id: 1, day: "2026-05-31", status: "done" },
        { habit_id: 1, day: "2026-05-30", status: "done" },
        { habit_id: 1, day: "2026-05-28", status: "done" }, // gap on 05-29
      ],
    });
    const json = await jsonOf(await GET(makeRequest("/api/habits?tz=0")));
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].streak).toBe(3);
    expect(json.rows[0].today_status).toBe("done");
    expect(json.rows[0].done_last_7).toBe(4);
    expect(json.rows[0].total_done).toBe(4);
    expect(json.today_ymd).toBe("2026-06-01");
  });

  it("POST creates a habit", async () => {
    const json = await jsonOf(await POST(makeRequest("/api/habits", { method: "POST", body: { name: "gym", emoji: "🏋️" } })));
    expect(json.row.name).toBe("gym");
    expect(getDb().prepare("SELECT COUNT(*) c FROM habits").get()).toMatchObject({ c: 1 });
  });

  it("POST 400 on missing name", async () => {
    const res = await POST(makeRequest("/api/habits", { method: "POST", body: {} }));
    expect(res.status).toBe(400);
  });

  it("PATCH renames; DELETE soft-archives but preserves logs", async () => {
    seedDb({ habits: [{ name: "meditate" }], habit_logs: [{ habit_id: 1, day: "2026-06-01", status: "done" }] });
    await PATCH(makeRequest("/x", { method: "PATCH", body: { name: "meditation" } }), ctx(1));
    expect((getDb().prepare("SELECT name FROM habits WHERE id=1").get() as { name: string }).name).toBe("meditation");
    const del = await jsonOf(await DELETE(makeRequest("/x", { method: "DELETE" }), ctx(1)));
    expect(del.archived).toBe(true);
    // archived habit hidden from GET
    const json = await jsonOf(await GET(makeRequest("/api/habits")));
    expect(json.rows).toHaveLength(0);
    // logs preserved (never hard-deleted)
    expect(getDb().prepare("SELECT COUNT(*) c FROM habit_logs").get()).toMatchObject({ c: 1 });
  });
});

describe("POST /api/habits/log", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  it("upserts a day log (toggling done -> skip -> none updates in place)", async () => {
    seedDb({ habits: [{ name: "meditate" }] });
    await LOG_POST(makeRequest("/x", { method: "POST", body: { habit_id: 1, status: "done", day: "2026-06-01" } }));
    await LOG_POST(makeRequest("/x", { method: "POST", body: { habit_id: 1, status: "skip", day: "2026-06-01" } }));
    const rows = getDb().prepare("SELECT status FROM habit_logs WHERE habit_id=1 AND day='2026-06-01'").all() as { status: string }[];
    expect(rows).toHaveLength(1); // upsert, not duplicate
    expect(rows[0].status).toBe("skip");
  });

  it("'none' soft-clears so the day no longer counts toward streak", async () => {
    seedDb({ habits: [{ name: "meditate" }], habit_logs: [{ habit_id: 1, day: "2026-06-01", status: "done" }] });
    await LOG_POST(makeRequest("/x", { method: "POST", body: { habit_id: 1, status: "none", day: "2026-06-01" } }));
    const json = await jsonOf(await GET(makeRequest("/api/habits?tz=0")));
    expect(json.rows[0].today_status).toBeNull();
    expect(json.rows[0].streak).toBe(0);
  });

  it("404 when habit_id does not exist", async () => {
    const res = await LOG_POST(makeRequest("/x", { method: "POST", body: { habit_id: 999, status: "done" } }));
    expect(res.status).toBe(404);
  });

  it("GET returns recent log days for a habit", async () => {
    seedDb({ habits: [{ name: "meditate" }], habit_logs: [
      { habit_id: 1, day: "2026-06-01", status: "done" },
      { habit_id: 1, day: "2026-05-31", status: "skip" },
    ]});
    const json = await jsonOf(await LOG_GET(makeRequest("/api/habits/log?habit_id=1&days=30")));
    expect(json.logs).toHaveLength(2);
    expect(json.logs[0].day).toBe("2026-06-01"); // DESC
  });
});
