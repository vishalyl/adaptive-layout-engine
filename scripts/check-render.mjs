// Real-browser rendering check: `npm run test:render`.
//
// The unit tests prove the RESOLVER never overlaps or clips. This proves
// the same thing about what a person actually sees: it serves the demo,
// opens every shipped ad on every shipped surface in a real Chrome, lets
// the webfont load, and asks the browser itself — not the engine — whether
//
//   * any text overflows its box (unless the resolver flagged it as cut,
//     in which case it must be showing an ellipsis instead),
//   * any button label is wider or taller than its button,
//   * any two elements overlap, or any element leaves the surface.
//
// Uses the Chrome already installed on the machine (playwright-core ships
// no browser). Override with CHROME_PATH=/path/to/chrome if needed.

import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('vite dev server did not report a URL');

const { ads } = await server.ssrLoadModule('/src/demo/creatives/index.ts');
const { surfaces } = await server.ssrLoadModule('/src/surfaces.ts');

const launchOptions = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH }
  : { channel: 'chrome' };
let browser;
try {
  browser = await chromium.launch(launchOptions);
} catch {
  browser = await chromium.launch({ channel: 'msedge' });
}

const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));

const failures = [];
let checked = 0;

for (const ad of ads) {
  for (const surface of surfaces) {
    await page.goto(`${base}?ad=${ad.key}&surface=${surface.key}&renderer=dom`);
    await page.waitForSelector('[data-surface-root]');
    // The resolver re-runs once the webfont is ready (App.tsx); give it a frame.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);

    const problems = await page.evaluate(() => {
      const out = [];
      const root = document.querySelector('[data-surface-root]');
      const W = root.offsetWidth;
      const H = root.offsetHeight;
      const boxes = [];
      for (const el of root.querySelectorAll('[data-element-id]')) {
        const id = el.dataset.elementId;
        // offset* are layout (pre-transform) pixels — the resolver's own units.
        const box = { id, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
        boxes.push(box);
        if (el.dataset.kind === 'text') {
          const cut = el.dataset.truncated === 'true';
          const overflowX = el.scrollWidth > el.clientWidth + 1;
          const overflowY = el.scrollHeight > el.clientHeight + 1;
          if ((overflowX || overflowY) && !cut) {
            out.push(`"${id}" text overflows its box: content ${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight}`);
          }
        }
        if (el.dataset.kind === 'button') {
          const label = el.querySelector('[data-label]');
          if (label.offsetWidth > el.clientWidth + 1 || label.offsetHeight > el.clientHeight + 1) {
            out.push(`"${id}" label ${label.offsetWidth}×${label.offsetHeight} doesn't fit its ${el.clientWidth}×${el.clientHeight} button`);
          }
        }
        if (box.x < -0.5 || box.y < -0.5 || box.x + box.w > W + 0.5 || box.y + box.h > H + 0.5) {
          out.push(`"${id}" leaves the ${W}×${H} surface`);
        }
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 0.5 && oy > 0.5) out.push(`"${a.id}" overlaps "${b.id}"`);
        }
      }
      return out;
    });
    checked += 1;
    for (const p of problems) failures.push(`${ad.key} on ${surface.key}: ${p}`);
  }
}

await browser.close();
await server.close();

for (const e of pageErrors) failures.push(`page error: ${e}`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} rendering problem(s) across ${checked} ad × surface combinations:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ ${checked} ad × surface combinations rendered in a real browser: no overflowing text, no clipped labels, no overlaps.`);
