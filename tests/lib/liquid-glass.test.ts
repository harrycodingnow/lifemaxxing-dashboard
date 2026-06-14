// @vitest-environment jsdom
//
// Tests for the Liquid Glass theme helper. The actual CSS overrides live in
// globals.css; this suite locks in the API contract (localStorage key,
// custom-event name, optimistic class-on-<html> mutation) so the page-level
// toggle button stays wired up.

import { describe, it, expect, beforeEach } from "vitest";
import {
  LIQUID_GLASS_CLASS,
  LIQUID_GLASS_EVENT,
  LIQUID_GLASS_LS_KEY,
  isLiquidGlassEnabled,
  setLiquidGlassEnabled,
} from "@/lib/liquid-glass";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
});

describe("liquid-glass theme helper", () => {
  it("reports disabled by default", () => {
    expect(isLiquidGlassEnabled()).toBe(false);
  });

  it("isLiquidGlassEnabled returns true once the LS key is set to '1'", () => {
    window.localStorage.setItem(LIQUID_GLASS_LS_KEY, "1");
    expect(isLiquidGlassEnabled()).toBe(true);
  });

  it("setLiquidGlassEnabled(true) writes LS + adds class on <html> immediately", () => {
    setLiquidGlassEnabled(true);
    expect(window.localStorage.getItem(LIQUID_GLASS_LS_KEY)).toBe("1");
    expect(document.documentElement.classList.contains(LIQUID_GLASS_CLASS)).toBe(true);
  });

  it("setLiquidGlassEnabled(false) writes '0' + removes class", () => {
    setLiquidGlassEnabled(true);
    setLiquidGlassEnabled(false);
    expect(window.localStorage.getItem(LIQUID_GLASS_LS_KEY)).toBe("0");
    expect(document.documentElement.classList.contains(LIQUID_GLASS_CLASS)).toBe(false);
  });

  it("dispatches the liquidglasschange CustomEvent with the new value", () => {
    let detail: unknown = "unset";
    const handler = (e: Event) => {
      detail = (e as CustomEvent).detail;
    };
    window.addEventListener(LIQUID_GLASS_EVENT, handler);
    try {
      setLiquidGlassEnabled(true);
      expect(detail).toBe(true);
      setLiquidGlassEnabled(false);
      expect(detail).toBe(false);
    } finally {
      window.removeEventListener(LIQUID_GLASS_EVENT, handler);
    }
  });
});
