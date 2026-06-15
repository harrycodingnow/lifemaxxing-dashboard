"use client";

// Minimal in-house i18n for the dashboard. No external deps — we don't need
// route-based locales or runtime parsing. Just:
//   - getLang() / setLang() with localStorage + a 'langchange' custom event
//   - useT() hook that returns t(key, vars?) bound to the current lang
//   - useLang() hook for the current code (re-renders on change)
//   - MESSAGES dict with all UI copy keyed by string id
//
// Keys are flat (no nesting). Adding a key without a translation just falls
// back to the EN version. Adding a key entirely missing falls back to the key
// itself so we never throw and bugs are visible in-place.

import { useEffect, useState, useCallback } from "react";

export type Lang = "en" | "zh";
export const LANG_LS_KEY = "lifemax.lang";
export const LANG_EVENT = "langchange";

export function getLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(LANG_LS_KEY);
  return v === "zh" ? "zh" : "en";
}

export function setLang(lang: Lang) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANG_LS_KEY, lang);
  document.documentElement.setAttribute("lang", lang === "zh" ? "zh-Hant" : "en");
  window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: lang }));
}

export function useLang(): Lang {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    setLangState(getLang());
    const onChange = () => setLangState(getLang());
    window.addEventListener(LANG_EVENT, onChange);
    return () => window.removeEventListener(LANG_EVENT, onChange);
  }, []);
  return lang;
}

// Each entry: { en, zh }. Use {{var}} for interpolation.
// Keep this dict alphabetically grouped by surface (navbar, chat, widgets, …)
// so it stays scannable as it grows.
export const MESSAGES = {
  // ── meta / brand
  "app.title": { en: "lifemaxxing", zh: "lifemaxxing" },

  // ── navbar
  "nav.review": { en: "📊 Review", zh: "📊 週報" },
  "nav.widgets.add": { en: "+ widgets", zh: "+ 小工具" },
  "nav.widgets.hidden": { en: "({{n}} hidden)", zh: "(已隱藏 {{n}})" },
  "nav.demo.on": {
    en: "Demo mode ON — showing mock data (not your real data). Click to turn off.",
    zh: "演示模式已開啟 — 顯示假資料(非你的真實資料)。點擊關閉。",
  },
  "nav.demo.off": {
    en: "Demo mode — fill the dashboard with realistic mock data for screenshots. Nothing is written to your database.",
    zh: "演示模式 — 填入逼真的假資料用於截圖。不會寫入你的資料庫。",
  },
  "nav.demo.enable": { en: "Enable demo mode", zh: "開啟演示模式" },
  "nav.demo.disable": { en: "Disable demo mode", zh: "關閉演示模式" },
  "nav.demo.label": { en: "Demo", zh: "演示" },
  "nav.lang.toggle": { en: "Switch to 中文", zh: "Switch to English" },
  "nav.lang.label.en": { en: "EN", zh: "EN" },
  "nav.lang.label.zh": { en: "中", zh: "中" },
  "nav.ccy.twd": { en: "TWD", zh: "新台幣" },
  "nav.ccy.usd": { en: "USD", zh: "美元" },
  "nav.netWorth": { en: "Net worth", zh: "淨資產" },

  // ── chat input
  "chat.placeholder.default": {
    en: "Log anything, or ask any question…",
    zh: "記錄任何事,或詢問任何問題…",
  },
  "chat.send": { en: "Send", zh: "送出" },
  "chat.parsing": { en: "Parsing…", zh: "解析中…" },
  "chat.autoSave.on": {
    en: "Auto-save ON — saving without confirmation",
    zh: "自動儲存已開啟 — 不再跳出確認",
  },
  "chat.autoSave.off": {
    en: "Auto-save OFF — click to skip confirmation popups",
    zh: "自動儲存已關閉 — 點擊跳過確認彈窗",
  },
  "chat.autoSave.enable": { en: "Enable auto-save", zh: "開啟自動儲存" },
  "chat.autoSave.disable": { en: "Disable auto-save", zh: "關閉自動儲存" },
  "chat.mic.title": { en: "Voice dictation", zh: "語音輸入" },
  "chat.widget.create.title": { en: "Generate a widget with AI", zh: "用 AI 產生小工具" },
  "chat.pinned.undo": { en: "Undo", zh: "復原" },
  "chat.pinned.undone": { en: "Undone.", zh: "已復原。" },
  "chat.pinned.savedAt": { en: "Saved at {{time}}", zh: "已於 {{time}} 儲存" },

  // ── hand-gesture control (webcam)
  "chat.gesture.title": { en: "Hand gesture control", zh: "手勢控制" },
  "chat.gesture.enable": { en: "Enable hand gesture control", zh: "開啟手勢控制" },
  "chat.gesture.disable": { en: "Disable hand gesture control", zh: "關閉手勢控制" },
  "chat.gesture.on": {
    en: "Gesture control ON — pinch 👌 to move a widget; hover 5s to resize",
    zh: "手勢控制已開啟 — 捏合 👌 移動小工具;停留 5 秒調整大小",
  },
  "chat.gesture.off": {
    en: "Control widgets with hand gestures via your webcam",
    zh: "透過網路攝影機用手勢控制小工具",
  },
  "chat.gesture.loading": { en: "Starting camera…", zh: "正在啟動攝影機…" },
  "chat.gesture.label": { en: "gesture", zh: "手勢" },
  "chat.gesture.hint": {
    en: "Pinch 👌 move · hover a widget 5s to resize",
    zh: "捏合 👌 移動 · 停留小工具 5 秒調整大小",
  },
  "chat.gesture.dragging": {
    en: "Dragging — release your pinch to drop",
    zh: "拖曳中 — 鬆開捏合放下",
  },
  "chat.gesture.dwell": {
    en: "Hold… releasing resize mode",
    zh: "保持… 即將進入調整大小模式",
  },
  "chat.gesture.resizing": {
    en: "Resizing — open/close your hand to size · hold still to set",
    zh: "調整大小中 — 張開/握合手掌調整 · 靜止片刻完成",
  },
  "chat.gesture.error.camera": {
    en: "Camera unavailable or permission denied",
    zh: "無法存取攝影機或權限被拒",
  },
  "chat.gesture.error.model": {
    en: "Couldn't load the hand-tracking model — check your connection",
    zh: "無法載入手部追蹤模型 — 請檢查網路連線",
  },
  "chat.gesture.retry": { en: "Retry", zh: "重試" },

  // ── answer card
  "answer.q": { en: "Q", zh: "問" },
  "answer.showSql": { en: "show SQL", zh: "顯示 SQL" },
  "answer.hideSql": { en: "hide SQL", zh: "隱藏 SQL" },
  "answer.dismiss": { en: "Dismiss", zh: "關閉" },
  "answer.rows.zero": { en: "No rows.", zh: "沒有資料。" },
  "answer.rows.count": { en: "{{n}} row", zh: "{{n}} 列" },
  "answer.rows.countPlural": { en: "{{n}} rows", zh: "{{n}} 列" },
  "answer.truncated": { en: "truncated at cap", zh: "已截斷至上限" },
  "answer.paramsLabel": { en: "params:", zh: "參數:" },

  // ── widget sidebar
  "sidebar.title": { en: "Widgets", zh: "小工具" },
  "sidebar.hint": {
    en: "Click + to add · drag onto grid · ✕ to hide",
    zh: "點 + 加入 · 拖到網格 · ✕ 隱藏",
  },
  "sidebar.filter": { en: "Filter…", zh: "搜尋…" },
  "sidebar.hidden": { en: "Hidden · {{n}}", zh: "已隱藏 · {{n}}" },
  "sidebar.onGrid": { en: "On grid · {{n}}", zh: "顯示中 · {{n}}" },
  "sidebar.add": { en: "+ add", zh: "+ 加入" },
  "sidebar.hide": { en: "hide", zh: "隱藏" },
  "sidebar.pinned": { en: "pinned", zh: "固定" },
  "sidebar.empty": { en: "No widgets match “{{q}}”.", zh: "沒有符合「{{q}}」的小工具。" },
  "sidebar.close": { en: "Close", zh: "關閉" },
  "sidebar.addToGrid": { en: "Add to grid", zh: "加入網格" },
  "sidebar.hideFromGrid": { en: "Hide from grid", zh: "從網格隱藏" },
  "sidebar.trigger.title": { en: "Add or manage widgets", zh: "新增或管理小工具" },
  "widgetHeader.hide": {
    en: "Hide widget (find it again in the + menu)",
    zh: "隱藏小工具(從 + 選單找回)",
  },

  // ── widget titles
  "widget.portfolio": { en: "Portfolio", zh: "投資組合" },
  "widget.nutrition": { en: "Nutrition", zh: "營養" },
  "widget.weight": { en: "Weight", zh: "體重" },
  "widget.projects": { en: "Projects", zh: "專案" },
  "widget.news": { en: "📰 News", zh: "📰 新聞" },
  "widget.todos": { en: "Todos", zh: "待辦" },
  "widget.spotify": { en: "Spotify", zh: "Spotify" },
  "widget.weather": { en: "Weather", zh: "天氣" },
  "widget.habits": { en: "Habits", zh: "習慣" },
  "widget.calendar": { en: "Calendar", zh: "行事曆" },
  "widget.networth": { en: "Net worth", zh: "淨資產" },
  "widget.recurring": { en: "Subscriptions", zh: "訂閱" },
  "widget.readLater": { en: "📑 Read Later", zh: "📑 稍後讀" },

  // ── portfolio
  "portfolio.total": { en: "Total", zh: "總計" },
  "portfolio.today": { en: "today", zh: "今日" },
  "portfolio.positions": { en: "{{n}} pos", zh: "{{n}} 部位" },
  "portfolio.tw": { en: "TW stocks", zh: "台股" },
  "portfolio.us": { en: "US stocks", zh: "美股" },
  "portfolio.crypto": { en: "Crypto", zh: "加密貨幣" },
  "portfolio.cash": { en: "Cash", zh: "現金" },
  "portfolio.empty": {
    en: "No positions yet — log a buy in the chat below.",
    zh: "目前沒有部位 — 在下方輸入框記錄一筆買入。",
  },

  // ── nutrition
  "nutrition.today": { en: "today", zh: "今日" },
  "nutrition.kcalLeft": { en: "{{n}} kcal left", zh: "剩餘 {{n}} 大卡" },
  "nutrition.meals": { en: "meals", zh: "餐點" },
  "nutrition.goals": { en: "goals", zh: "目標" },
  "nutrition.protein": { en: "P", zh: "蛋白" },
  "nutrition.carbs": { en: "C", zh: "碳水" },
  "nutrition.fat": { en: "F", zh: "脂肪" },
  "nutrition.kcal": { en: "KCAL", zh: "熱量" },
  "nutrition.breakfast": { en: "Breakfast", zh: "早餐" },
  "nutrition.lunch": { en: "Lunch", zh: "午餐" },
  "nutrition.dinner": { en: "Dinner", zh: "晚餐" },
  "nutrition.snack": { en: "Snack", zh: "點心" },
  "nutrition.empty": {
    en: "Nothing logged today — try “had eggs and oats for breakfast”.",
    zh: "今日尚未記錄 — 試試「早餐吃蛋和燕麥」。",
  },

  // ── weight
  "weight.current": { en: "Current", zh: "目前" },
  "weight.change": { en: "{{n}} kg over {{days}}d", zh: "{{days}} 天 {{n}} 公斤" },
  "weight.empty": {
    en: "No weight logs yet — log one with “72.5 kg”.",
    zh: "尚未有體重紀錄 — 用「72.5 公斤」記錄一筆。",
  },

  // ── projects
  "projects.active": { en: "{{n}} active", zh: "進行中 {{n}}" },
  "projects.status.on_track": { en: "on track", zh: "順利" },
  "projects.status.at_risk": { en: "at risk", zh: "有風險" },
  "projects.status.blocked": { en: "blocked", zh: "受阻" },
  "projects.phase.idea": { en: "IDEA", zh: "想法" },
  "projects.phase.planning": { en: "PLANNING", zh: "規劃" },
  "projects.phase.building": { en: "BUILDING", zh: "建構" },
  "projects.phase.shipping": { en: "SHIPPING", zh: "發布" },
  "projects.phase.maintaining": { en: "MAINTAINING", zh: "維護" },
  "projects.phase.paused": { en: "PAUSED", zh: "暫停" },

  // ── spotify
  "spotify.connect": { en: "Connect Spotify", zh: "連接 Spotify" },
  "spotify.disconnect": { en: "Disconnect", zh: "中斷連線" },
  "spotify.nothingPlaying": { en: "Nothing playing", zh: "目前未播放" },
  "spotify.play": { en: "Play", zh: "播放" },
  "spotify.pause": { en: "Pause", zh: "暫停" },
  "spotify.next": { en: "Next track", zh: "下一首" },
  "spotify.previous": { en: "Previous track", zh: "上一首" },
  "spotify.openApp": {
    en: "Open the Spotify app on any device first.",
    zh: "請先在任一裝置開啟 Spotify 應用程式。",
  },
  "spotify.toast.connected": { en: "Spotify connected", zh: "已連接 Spotify" },
  "spotify.toast.canceled": { en: "Spotify connect canceled", zh: "已取消連接 Spotify" },
  "spotify.toast.error": { en: "Spotify connect failed", zh: "連接 Spotify 失敗" },

  // ── weather
  "weather.today": { en: "Today", zh: "今日" },
  "weather.feelsLike": { en: "Feels like", zh: "體感" },
  "weather.humidity": { en: "Humidity", zh: "濕度" },
  "weather.wind": { en: "Wind", zh: "風速" },
  "weather.precip": { en: "Precip", zh: "降雨機率" },
  "weather.high": { en: "High", zh: "高" },
  "weather.low": { en: "Low", zh: "低" },

  // ── widget creator
  "creator.title": { en: "Generate a widget", zh: "產生小工具" },
  "creator.placeholder": {
    en: "Describe the widget you want (e.g. “a daily quote in big serif”)…",
    zh: "描述你想要的小工具(例如「大字體的每日金句」)…",
  },
  "creator.generate": { en: "Generate", zh: "產生" },
  "creator.generating": { en: "Generating…", zh: "產生中…" },
  "creator.delete": { en: "Delete widget", zh: "刪除小工具" },

  // ── review / weekly review
  "review.title": { en: "Weekly Review", zh: "週報" },
  "review.generating": { en: "Generating review…", zh: "產生週報中…" },
  "review.close": { en: "Close", zh: "關閉" },

  // ── common
  "common.loading": { en: "Loading…", zh: "載入中…" },
  "common.error": { en: "Error", zh: "錯誤" },
  "common.retry": { en: "Retry", zh: "重試" },
  "common.cancel": { en: "Cancel", zh: "取消" },
  "common.confirm": { en: "Confirm", zh: "確認" },
  "common.delete": { en: "Delete", zh: "刪除" },
  "common.save": { en: "Save", zh: "儲存" },
  "common.edit": { en: "Edit", zh: "編輯" },
  "common.add": { en: "Add", zh: "新增" },
  "common.search": { en: "Search…", zh: "搜尋…" },
  "common.none": { en: "None", zh: "無" },
} as const;

export type MsgKey = keyof typeof MESSAGES;

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
}

// Pure function — useful for non-React call sites (e.g. tests, route helpers).
export function tFor(lang: Lang, key: MsgKey, vars?: Record<string, string | number>): string {
  const entry = MESSAGES[key];
  if (!entry) return String(key);
  const raw = (entry as { en: string; zh?: string })[lang] ?? entry.en;
  return interpolate(raw, vars);
}

// React hook — returns t() bound to the current lang. Re-renders whenever the
// language flips.
export function useT() {
  const lang = useLang();
  const t = useCallback(
    (key: MsgKey, vars?: Record<string, string | number>) => tFor(lang, key, vars),
    [lang],
  );
  return { t, lang };
}
