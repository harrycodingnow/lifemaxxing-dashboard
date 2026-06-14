"use client";

// Optional "Liquid Glass" theme — frosted, translucent, iOS-26-ish material
// finish for the whole dashboard. State persists to localStorage so the
// choice survives a refresh. A custom event lets components re-render if they
// need to react to the flip (most components don't — the CSS overrides do
// the heavy lifting).

export const LIQUID_GLASS_LS_KEY = "lifemax.liquidGlass";
export const LIQUID_GLASS_EVENT = "liquidglasschange";
// Root CSS class. Anything under `.liquid-glass` in the global stylesheet gets
// the frosted treatment. We keep all overrides scoped to this class so the
// default dark theme remains pristine when the toggle is off.
export const LIQUID_GLASS_CLASS = "liquid-glass";

export function isLiquidGlassEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LIQUID_GLASS_LS_KEY) === "1";
}

export function setLiquidGlassEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIQUID_GLASS_LS_KEY, on ? "1" : "0");
  // Also flip the class on <html> immediately so the override stylesheet
  // applies even before React commits a re-render (cheap optimistic update).
  document.documentElement.classList.toggle(LIQUID_GLASS_CLASS, on);
  window.dispatchEvent(new CustomEvent(LIQUID_GLASS_EVENT, { detail: on }));
}
