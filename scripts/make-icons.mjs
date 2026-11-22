// Renders PNG app icons from the SVG using the pre-installed Playwright Chromium.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icons/favicon.svg', import.meta.url), 'utf8');
const full = svg.replace(/rx="112"/, 'rx="0"'); // iOS masks the corners itself
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, size, markup, pad = 0) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - pad * 2;
  await page.setContent(`<html><body style="margin:0;background:#0f1b33;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">${markup.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname, omitBackground: false });
}
await render('apple-touch-icon.png', 180, full);
await render('icon-192.png', 192, svg.replace(/rx="112"/, 'rx="96"'));
await render('icon-512.png', 512, svg.replace(/rx="112"/, 'rx="96"'));
await render('maskable-512.png', 512, full, 52);
await browser.close();
console.log('icons written');
