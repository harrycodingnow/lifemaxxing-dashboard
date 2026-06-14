// Final probe: inspect the React-rendered tree of DashboardLayout's grid div
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}]`, t.slice(0, 200));
  });

  await page.context().addInitScript(() => {
    try { localStorage.setItem("demoMode", "1"); } catch (e) {}
  });

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "load" });
  await page.waitForTimeout(6000);

  const dom = await page.evaluate(() => {
    function walk(el, depth = 0, max = 4) {
      if (depth > max) return null;
      return {
        tag: el.tagName,
        cls: (el.className || "").toString().slice(0, 80),
        w: el.offsetWidth,
        h: el.offsetHeight,
        kids: Array.from(el.children).slice(0, 12).map((c) => walk(c, depth + 1, max)).filter(Boolean),
      };
    }
    const grid = document.querySelector(".flex-1.overflow-auto.min-h-0.px-2.pt-2");
    return grid ? walk(grid) : "missing grid";
  });
  console.log(JSON.stringify(dom, null, 2));

  // Force a window resize to nudge ResizeObserver
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(2000);

  const after = await page.evaluate(() => {
    const grid = document.querySelector(".flex-1.overflow-auto.min-h-0.px-2.pt-2");
    return { kids: grid ? grid.children.length : "none" };
  });
  console.log("after resize:", JSON.stringify(after));

  await browser.close();
})();
