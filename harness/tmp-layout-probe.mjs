import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://127.0.0.1:4300/ride', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(12000);
console.log(JSON.stringify(await p.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const chain = [];
  let el = canvas;
  while (el && el !== document.documentElement && chain.length < 7) {
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 50),
      box: `${el.clientWidth}x${el.clientHeight}`,
      height: cs.height, minHeight: cs.minHeight, position: cs.position,
      display: cs.display, flex: cs.flex, gridRow: cs.gridTemplateRows.slice(0, 40),
    });
    el = el.parentElement;
  }
  return chain;
}, null), null, 1));
await b.close();
