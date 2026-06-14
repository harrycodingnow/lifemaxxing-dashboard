// Listen for hydration errors specifically
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on("console", (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 400)));
  page.on("pageerror", (e) => console.log("[pageerror]", e.message, "\n", e.stack?.slice(0, 500)));

  await page.context().addInitScript(() => {
    try { localStorage.setItem("demoMode", "1"); } catch (e) {}
  });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "load" });
  await page.waitForTimeout(8000);

  await browser.close();
})();
