// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { extractJson, hermesCall } from "@/lib/hermes";

describe("extractJson", () => {
  it("parses a fenced ```json block", () => {
    const txt = "blah blah\n```json\n{\"a\":1}\n```\nfoot";
    expect(extractJson(txt)).toEqual({ a: 1 });
  });

  it("parses a bare {} blob with prose", () => {
    const txt = "Here is my answer:\n{\"intent\":\"trade\"}";
    expect(extractJson(txt)).toEqual({ intent: "trade" });
  });

  it("parses a bare [] blob", () => {
    expect(extractJson("noise [1,2,3] trailing")).toEqual([1, 2, 3]);
  });

  it("picks the LONGEST valid candidate when multiple {} appear", () => {
    const txt = `{"a":1}\nactual answer:\n{"a":1,"b":2,"deep":{"x":[1,2,3]}}`;
    expect(extractJson(txt)).toEqual({ a: 1, b: 2, deep: { x: [1, 2, 3] } });
  });

  it("throws clearly when there is no JSON at all", () => {
    expect(() => extractJson("nothing here, sorry")).toThrow(/no JSON/);
  });

  it("handles trailing whitespace and fences with no language tag", () => {
    const txt = "```\n  {\"ok\": true}  \n```";
    expect(extractJson(txt)).toEqual({ ok: true });
  });
});

describe("hermesCall env override", () => {
  it("HERMES_BIN env var overrides the hardcoded path (spawn arg captured)", async () => {
    const { spawn } = await import("child_process");
    const spawnMock = vi.mocked(spawn);
    spawnMock.mockReset();
    // simulate a child that resolves "ok"
    const fakeChild: any = {
      stdout: { on: (_: string, cb: (b: Buffer) => void) => cb(Buffer.from("ok")) },
      stderr: { on: () => {} },
      on: (event: string, cb: any) => {
        if (event === "close") setTimeout(() => cb(0), 1);
      },
      kill: () => {},
    };
    spawnMock.mockReturnValue(fakeChild as any);

    process.env.HERMES_BIN = "/custom/path/to/hermes";
    // Re-import to bypass the @/lib/hermes mock in setup — we want the REAL implementation here.
    const real = await vi.importActual<typeof import("@/lib/hermes")>("@/lib/hermes");
    const result = await real.hermesCall("hi", { timeoutMs: 1000 });
    expect(result).toBe("ok");
    expect(spawnMock).toHaveBeenCalledWith(
      "/custom/path/to/hermes",
      expect.arrayContaining(["-z", "hi", "--yolo"]),
      expect.any(Object),
    );
    delete process.env.HERMES_BIN;
  });
});

// Sanity: the global mock means our test-level hermesCall is the mocked one,
// not the real subprocess invoker.
describe("hermesCall is mocked at module level (safety net)", () => {
  it("calling the mocked hermesCall without a responder throws", async () => {
    await expect(hermesCall("anything")).rejects.toThrow(/no responder/);
  });
});
