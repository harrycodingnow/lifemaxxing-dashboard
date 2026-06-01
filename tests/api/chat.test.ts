// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/chat/route";
import { seedDb } from "../helpers/db";

describe("GET /api/chat", () => {
  it("returns [] when empty", async () => {
    const json = await (await GET()).json();
    expect(json.messages).toEqual([]);
  });

  it("returns last 50 messages chronologically (oldest first)", async () => {
    const base = Date.now();
    const chat: any[] = [];
    for (let i = 0; i < 75; i++) {
      chat.push({ ts: base + i * 1000, role: i % 2 === 0 ? "user" : "assistant", text: `m${i}` });
    }
    seedDb({ chat });
    const json = await (await GET()).json();
    expect(json.messages).toHaveLength(50);
    // chronological: ts ascending
    for (let i = 1; i < json.messages.length; i++) {
      expect(json.messages[i].ts).toBeGreaterThanOrEqual(json.messages[i - 1].ts);
    }
    // last 50 → starts at m25
    expect(json.messages[0].text).toBe("m25");
    expect(json.messages.at(-1).text).toBe("m74");
  });
});
