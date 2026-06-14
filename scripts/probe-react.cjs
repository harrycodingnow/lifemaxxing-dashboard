// Probe React hydration & DashboardLayout state
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[reqfailed] ${r.url()} :: ${r.failure()?.errorText}`));

  await page.context().addInitScript(() => {
    try {
      localStorage.setItem("demoMode", "1");
    } catch (e) {}
  });

  await page.goto("http://127.0.0.1:3000/", { waitUntil: "load" });
  await page.waitForTimeout(5000);

  // Did React mount? Check for any element with React fiber.
  const reactState = await page.evaluate(() => {
    const root = document.querySelector(".h-screen.w-screen");
    if (!root) return { mounted: false, reason: "no root" };
    const childTags = Array.from(root.children).map(c => c.tagName + '.' + (c.className||'').slice(0,60));
    return { mounted: true, childCount: root.children.length, childTags };
  });
  console.log("REACT STATE", JSON.stringify(reactState, null, 2));
  console.log("LOGS LAST 30:");
  for (const l of logs.slice(-30)) console.log("  ", l);

  await browser.close();
})();
