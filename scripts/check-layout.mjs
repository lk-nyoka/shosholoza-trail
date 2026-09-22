/**
 * The layout check.
 *
 * Screenshots prove what a page looks like; this proves things a screenshot
 * cannot. It opens the built app in a real browser at real phone sizes and
 * measures, from the live layout:
 *
 *   - that every interactive target is at least 44x44 CSS pixels (WCAG 2.5.8
 *     asks for 24x24; a thumb on a moving train needs 44);
 *   - that no two chrome regions overlap in a way that hides one behind the
 *     other, in any of the ride's three states;
 *   - that nothing overflows the viewport horizontally;
 *   - that the ride's view switch is reachable in every state, including the
 *     cinematic one, so no state is a trap.
 *
 *   node scripts/check-layout.mjs            # needs `npx vite preview` running
 *   node scripts/check-layout.mjs http://... # or point it somewhere
 *
 * Exits non-zero on any failure, so it can gate a release the same way the
 * test suites do.
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

/**
 * Serve `dist/` from inside this script rather than leaning on a separate
 * `vite preview` in another terminal. One command, no ordering to get wrong,
 * and it behaves the same on Windows as it does in CI.
 */
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".hdr": "image/vnd.radiance",
};

const startServer = async root => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let file = join(root, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ""));
    if (!existsSync(file) || extname(file) === "") file = join(root, "index.html");
    try {
      const body = readFileSync(file);
      response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
};

const givenBase = process.argv.slice(2).find(argument => argument.startsWith("http"));
const served = givenBase ? null : await startServer("dist");
const BASE = givenBase ?? served.base;

/**
 * Use whatever Chromium is on this machine.
 *
 * Playwright pins a browser build and refuses to start if that exact one is
 * missing, which is a download the team should not need on a laptop that
 * already has Chrome. CHROMIUM_PATH, then the container's own build, then
 * Playwright's default.
 */
const executablePath = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find(candidate => candidate && existsSync(candidate));

const ALL_DEVICES = [
  { name: "iPhone SE",    width: 320, height: 568 },
  { name: "iPhone 12/13", width: 390, height: 844 },
  { name: "Pixel 7",      width: 412, height: 915 },
  { name: "iPad mini",    width: 768, height: 1024 },
  { name: "Laptop",       width: 1280, height: 800 },
];
/**
 * `--quick` runs the two sizes that catch almost everything — the narrowest
 * phone and the commonest one — so the check fits inside a normal edit loop.
 * The full sweep is what runs before a release.
 */
const DEVICES = process.argv.includes("--quick")
  ? ALL_DEVICES.filter(device => device.width === 320 || device.width === 390)
  : ALL_DEVICES;

/** Regions that must never be covered by another region. */
const CHROME = [
  ".ride-viewswitch", ".ride-topbar", ".ride-controls", ".ride-stops",
  ".ride-context-panel__handle", ".ride-experience", ".ride-modes",
];

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
};

const measure = page => page.evaluate(selectors => {
  const visible = element => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) < 0.05) return false;
    if (style.pointerEvents === "none") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  /**
   * WCAG 2.5.8 exempts a link inside a sentence: making it 44 px tall would
   * wreck the line height of the paragraph around it, and the sentence itself
   * is the target. So a link whose parent is running text is measured only
   * for being present, not for size.
   */
  const inSentence = element => {
    if (element.tagName !== "A") return false;
    const parent = element.parentElement;
    if (!parent) return false;
    if (!["P", "LI", "SPAN", "SMALL", "TD", "DD", "H1", "H2", "H3", "H4"].includes(parent.tagName)) return false;
    return (parent.textContent ?? "").trim().length > (element.textContent ?? "").trim().length + 8;
  };
  const targets = [...document.querySelectorAll("button, a[href], input, select, [role='radio'], [role='button']")]
    .filter(visible)
    .filter(element => !inSentence(element))
    .map(element => {
      const rect = element.getBoundingClientRect();
      /**
       * A small painted control can carry a bigger hit area on an absolutely
       * positioned ::before/::after - the technique this app uses for the
       * photo dots and the experience card's close button, so a 7 px dot
       * stays a 7 px dot and still catches a thumb. What matters to a rider
       * is the area that responds to a tap, so measure that.
       */
      let width = rect.width;
      let height = rect.height;
      for (const pseudo of ["::before", "::after"]) {
        const style = getComputedStyle(element, pseudo);
        if (style.content === "none" || style.position !== "absolute") continue;
        if (style.pointerEvents === "none") continue;
        width = Math.max(width, parseFloat(style.width) || 0);
        height = Math.max(height, parseFloat(style.height) || 0);
      }
      return {
        label: (element.getAttribute("aria-label") || element.textContent || element.className || element.tagName)
          .trim().slice(0, 48),
        width: Math.round(width * 10) / 10,
        height: Math.round(height * 10) / 10,
      };
    });
  const regions = selectors
    .map(selector => ({ selector, element: document.querySelector(selector) }))
    .filter(entry => entry.element && visible(entry.element))
    .map(entry => {
      const rect = entry.element.getBoundingClientRect();
      return { selector: entry.selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  /**
   * `document.scrollWidth` cannot detect this app's overflow.
   *
   * `html, body { overflow-x: clip }` is set deliberately (it stops a wide
   * element breaking `position: sticky`, which `hidden` would), and `clip`
   * removes the overflow from the scroll box entirely - so a bar running 90 px
   * off the right edge reports a scrollWidth exactly equal to the viewport.
   * The first version of this check passed a screen whose top bar was visibly
   * cut in half. Measure the elements themselves instead.
   */
  const overflowing = [...document.querySelectorAll("body *")]
    .filter(visible)
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(entry => entry.rect.width > 24 && entry.rect.height > 8)
    .filter(entry => entry.rect.right > window.innerWidth + 1 || entry.rect.left < -1)
    // A child of a horizontally scrollable strip is SUPPOSED to run past the
    // edge - that is what makes it scrollable. The strip itself is still
    // checked, and it is the one that must fit.
    .filter(entry => {
      for (let node = entry.element.parentElement; node; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return false;
      }
      return true;
    })
    // Report the outermost offender, not every child inside it.
    .filter(entry => !entry.element.parentElement
      || entry.element.parentElement.getBoundingClientRect().right <= window.innerWidth + 1)
    .map(entry => `${entry.element.className || entry.element.tagName} right=${Math.round(entry.rect.right)}`)
    .slice(0, 5);

  return {
    targets,
    regions,
    overflowing,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
}, selectorsArg());

function selectorsArg() { return CHROME; }

const overlapArea = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
};


/*
 * No browser on this machine.
 *
 * The team works on Windows without a Playwright browser download, and this
 * check has to behave honestly there. It does not fail - a missing browser is
 * not a defect in the app - and it does not quietly pass either, which would
 * be reporting a verification that never ran. It says what it did not check,
 * and exits 0 so it cannot block a build for the wrong reason.
 */
let browser = null;
try {
  browser = await chromium.launch({
    args: ["--no-sandbox"],
    ...(executablePath ? { executablePath } : {}),
  });
} catch (error) {
  served?.server.close();
  console.log(
    `SKIP  this check did NOT run - no Chromium on this machine\n` +
    `      (${error?.message?.split("\n")[0] ?? error})\n` +
    `      Run \`npx playwright install chromium\` to enable it.`,
  );
  process.exit(0);
}


for (const device of DEVICES) {
  const context = await browser.newContext({ viewport: { width: device.width, height: device.height } });
  const page = await context.newPage();
  // The scene needs a trip in storage or it shows the setup card instead.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("st.trip.v1", JSON.stringify({ boardId: "pretoria", alightId: "cape-town", date: "2026-09-22", direction: "southbound" }));
    } catch { /* private mode; the page copes */ }
  });

  for (const route of ["/", "/ride", "/journey", "/help"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(650);

    const states = route === "/ride" ? ["cinematic", "explore", "control"] : [null];
    for (const state of states) {
      if (state) {
        const button = page.locator(`.ride-viewswitch__btn`).nth(["cinematic", "explore", "control"].indexOf(state));
        const reachable = await button.isVisible().catch(() => false);
        check(`${device.name} ${route} — the ${state} switch is reachable`, reachable);
        if (reachable) {
          await button.click();
          await page.waitForTimeout(420);
        }
      }
      const where = `${device.name} ${route}${state ? ` (${state})` : ""}`;
      const { targets, regions, overflowing, innerWidth } = await measure(page);

      /**
       * 44 px is the TOUCH target. On a pointer device the requirement is
       * WCAG 2.5.8's 24 px, and demanding 44 there would mean a desktop UI
       * built out of phone-sized buttons for no one's benefit. The app's
       * breakpoint for touch layout is 900 px, so the check uses the same
       * line rather than a second opinion about where phones end.
       */
      const minimum = device.width <= 900 ? 44 : 24;
      const small = targets.filter(t => t.width < minimum || t.height < minimum);
      check(
        `${where} — every target is ${minimum}x${minimum}`,
        small.length === 0,
        small.slice(0, 4).map(t => `${t.label} ${t.width}x${t.height}`).join("; "),
      );

      check(
        `${where} — nothing runs off the side`,
        overflowing.length === 0,
        `${overflowing.join("; ")} (viewport ${innerWidth})`,
      );

      const clashes = [];
      for (let i = 0; i < regions.length; i += 1) {
        for (let j = i + 1; j < regions.length; j += 1) {
          const area = overlapArea(regions[i], regions[j]);
          const smaller = Math.min(
            regions[i].width * regions[i].height,
            regions[j].width * regions[j].height,
          );
          if (smaller > 0 && area / smaller > 0.25) {
            clashes.push(`${regions[i].selector} x ${regions[j].selector}`);
          }
        }
      }
      check(`${where} — no chrome region buries another`, clashes.length === 0, clashes.join("; "));
    }
  }
  await context.close();
}

await browser.close();
served?.server.close();
console.log(failures === 0 ? "\nlayout clean" : `\n${failures} layout problem(s)`);
process.exitCode = failures === 0 ? 0 : 1;
