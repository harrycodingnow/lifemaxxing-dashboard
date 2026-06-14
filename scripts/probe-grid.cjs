// Debug: why doesn't the DashboardLayout grid render?
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

  await page.context().addInitScript(() => {
    try {
      localStorage.setItem("demoMode", "1");
      localStorage.removeItem("lifemax.liquidGlass");
      localStorage.removeItem("lifemax.dashboard.hidden.v1");
    } catch (e) {}
  });

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const probe = await page.evaluate(() => {
    const root = document.querySelector(".h-screen.w-screen");
    const slot = document.getElementById("dashboard-widgets-slot");
    const grid = document.querySelector(".react-grid-layout");
    const flex = document.querySelector(".flex-1.overflow-auto.min-h-0");
    return {
      rootRect: root ? root.getBoundingClientRect() : null,
      slotChildren: slot ? slot.children.length : "missing",
      gridMounted: !!grid,
      gridRect: grid ? grid.getBoundingClientRect() : null,
      flexRect: flex ? flex.getBoundingClientRect() : null,
      flexChildren: flex ? flex.children.length : "missing",
      // dump bodyChildren classes
      bodyChildrenClasses: Array.from(document.body.children).map(
        (c) => `${c.tagName}.${(c.className || "").slice(0, 80)}`,
      ),
    };
  });
  console.log("PROBE", JSON.stringify(probe, null, 2));
  console.log("CONSOLE LOGS:");
  for (const l of logs.slice(-50)) console.log("  ", l);

  await browser.close();
})();
