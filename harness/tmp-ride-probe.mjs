import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
await p.goto('http://127.0.0.1:4300/ride', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(18000);
const out = await p.evaluate(() => {
  const m = globalThis.__rideMap;
  const c = document.querySelector('canvas');
  return {
    hasMap: !!m,
    canvas: c ? `${c.width}x${c.height}` : null,
    loaded: m ? m.loaded() : null,
    zoom: m ? m.getZoom() : null,
    pitch: m ? m.getPitch() : null,
    centre: m ? m.getCenter().toArray() : null,
    terrain: m ? !!m.getTerrain() : null,
    layers: m ? m.getStyle().layers.length : null,
    sources: m ? Object.keys(m.getStyle().sources) : null,
  };
});
const after = await p.evaluate(async () => {
  const m = globalThis.__rideMap;
  const host = document.querySelector('canvas').parentElement;
  const before = { canvas: `${document.querySelector('canvas').width}x${document.querySelector('canvas').height}`,
                   host: `${host.clientWidth}x${host.clientHeight}` };
  m.resize();
  await new Promise(r => setTimeout(r, 4000));
  return { before, after: `${document.querySelector('canvas').width}x${document.querySelector('canvas').height}`, loaded: m.loaded() };
});
console.log(JSON.stringify({ out, after, errs: errs.slice(0, 8) }, null, 1));
await p.screenshot({ path: 'evidence/ride-probe.png' });
await b.close();
