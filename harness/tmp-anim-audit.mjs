import { chromium } from 'playwright';

const base = process.env.BASE || 'http://127.0.0.1:4300';
const route = process.env.ROUTE || '/animation';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

const reqs = [];
page.on('response', async r => {
  const url = r.url();
  let size = 0;
  try { size = (await r.body()).length; } catch { /* opaque */ }
  reqs.push({ url: url.replace(base, ''), type: r.request().resourceType(), size, status: r.status() });
});

const t0 = Date.now();
await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(6000);

const byType = {};
let total = 0;
for (const r of reqs) {
  byType[r.type] = (byType[r.type] ?? 0) + r.size;
  total += r.size;
}
const external = reqs.filter(r => /^https?:/.test(r.url));
const heaviest = [...reqs].sort((a, b) => b.size - a.size).slice(0, 20);

console.log(JSON.stringify({
  route, loadMs, requests: reqs.length,
  totalKB: Math.round(total / 1024),
  byTypeKB: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v / 1024)])),
  externalHosts: [...new Set(external.map(r => new URL(r.url).host))],
  heaviest: heaviest.map(r => `${Math.round(r.size / 1024)}KB ${r.type} ${r.url.slice(0, 70)}`),
}, null, 1));

await page.screenshot({ path: `evidence/audit-${route.replace(/\W/g, '') || 'root'}.png` });
await browser.close();
