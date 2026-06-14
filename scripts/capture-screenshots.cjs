// Capture dashboard screenshots in demo mode for the README.
// Boots a real Chromium via Playwright, primes localStorage with the demo
// flag (and the liquid-glass flag for one shot), takes 4 screenshots covering
// the major UI surfaces. Idempotent — re-runnable any time.

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

const URL = "http://127.0.0.1:3000/";
const WIDTH = 1440;
const HEIGHT = 900;

async function settle(page, ms = 1500) {
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2, // crisp on retina readmes
  });
  const page = await context.newPage();

  // Seed demo + glass flags BEFORE the app's <script> bootstrap runs.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("demoMode", "1");
      localStorage.removeItem("lifemax.liquidGlass");
      // Reset hidden state so all default-on widgets show in the screenshot.
      localStorage.removeItem("lifemax.dashboard.hidden.v1");
      localStorage.removeItem("lifemax.dashboard.dock.v1");
    } catch (e) {}
  });

  // ── 1. Dark default + Demo mode on
  await page.goto(URL, { waitUntil: "networkidle" });
  await settle(page, 3500); // let widgets fetch & charts mount
  await shot(page, "01-dashboard-dark-demo");

  // ── 2. Widget sidebar (+ widgets) open
  const trigger = await page.$("[data-testid='widget-sidebar-trigger']");
  if (trigger) {
    await trigger.click();
    await settle(page, 800);
    await shot(page, "02-widget-sidebar");
    // close sidebar
    await page.keyboard.press("Escape").catch(() => {});
    await page
      .click("[data-testid='widget-sidebar-scrim']", { force: true })
      .catch(() => {});
    await settle(page, 400);
  } else {
    console.warn("sidebar trigger missing — skipping sidebar shot");
  }

  // ── 3. Liquid Glass ON
  await page.evaluate(() => {
    localStorage.setItem("lifemax.liquidGlass", "1");
  });
  await page.reload({ waitUntil: "networkidle" });
  await settle(page, 5500);
  // Confirm the wallpaper animation actually painted — wait one extra raf
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await shot(page, "03-liquid-glass");

  // Turn glass back off before the answer-card shot — readability wins.
  await page.evaluate(() => {
    localStorage.setItem("lifemax.liquidGlass", "0");
  });
  await page.reload({ waitUntil: "networkidle" });
  await settle(page, 3000);

  // ── 4. Ask-your-data: type a question, submit, capture the AnswerCard
  const input = await page.$('textarea, input[type="text"]');
  if (input) {
    await input.click();
    await input.type("how many trades do I have?");
    await page.keyboard.press("Enter");
    // wait for AnswerCard to render
    try {
      await page.waitForSelector("[data-testid='answer-card']", {
        timeout: 12000,
      });
      await settle(page, 600);
    } catch (e) {
      console.warn("answer-card never showed:", e.message);
    }
    await shot(page, "04-ask-your-data");
  }

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
