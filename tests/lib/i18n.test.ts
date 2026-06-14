// @vitest-environment jsdom
//
// Tests for src/lib/i18n.ts — locks in the public API contract:
//   - getLang() defaults to en when LS empty
//   - setLang() writes LS, mutates <html lang>, fires custom event
//   - tFor(lang, key) returns the right string + interpolates {{var}}
//   - missing key → string id fallback (no throw)

import { describe, it, expect, beforeEach } from "vitest";
import {
  getLang,
  setLang,
  tFor,
  LANG_LS_KEY,
  LANG_EVENT,
  MESSAGES,
} from "@/lib/i18n";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("lang");
});

describe("i18n helper", () => {
  it("defaults to en", () => {
    expect(getLang()).toBe("en");
  });

  it("setLang('zh') persists + sets html[lang] + fires event with the new code", () => {
    let received: unknown = "unset";
    const handler = (e: Event) => {
      received = (e as CustomEvent).detail;
    };
    window.addEventListener(LANG_EVENT, handler);
    try {
      setLang("zh");
      expect(window.localStorage.getItem(LANG_LS_KEY)).toBe("zh");
      expect(document.documentElement.getAttribute("lang")).toBe("zh-Hant");
      expect(received).toBe("zh");
      expect(getLang()).toBe("zh");
    } finally {
      window.removeEventListener(LANG_EVENT, handler);
    }
  });

  it("setLang('en') flips back to en + html[lang]=en", () => {
    setLang("zh");
    setLang("en");
    expect(window.localStorage.getItem(LANG_LS_KEY)).toBe("en");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("tFor returns the EN string for an EN call", () => {
    expect(tFor("en", "nav.demo.label")).toBe(MESSAGES["nav.demo.label"].en);
  });

  it("tFor returns the ZH string when one exists", () => {
    expect(tFor("zh", "nav.demo.label")).toBe(MESSAGES["nav.demo.label"].zh);
  });

  it("tFor interpolates {{n}} for plural-style keys", () => {
    const en = tFor("en", "answer.rows.count", { n: 3 });
    const zh = tFor("zh", "answer.rows.count", { n: 3 });
    expect(en).toContain("3");
    expect(zh).toContain("3");
  });

  it("tFor returns key as fallback when key is unknown (no throw)", () => {
    expect(tFor("en", "no.such.key.exists" as never)).toBe("no.such.key.exists");
  });

  it("every MESSAGES entry has BOTH en and zh values (no missing translation)", () => {
    const missing: string[] = [];
    for (const [key, val] of Object.entries(MESSAGES)) {
      const v = val as { en: string; zh?: string };
      if (!v.en || !v.zh) missing.push(key);
    }
    expect(missing).toEqual([]);
  });
});
