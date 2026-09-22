/**
 * The accessibility check.
 *
 * "We did an accessibility pass" is the kind of claim nobody can verify and
 * everybody makes. This one runs axe-core — the same engine behind most
 * browser accessibility extensions — against the built app in a real browser,
 * on every page, in both the light and dark colour schemes, and fails on any
 * serious or critical violation.
 *
 * It does not chase a score. axe finds real defects and also flags things that
 * are correct in context; the ones this app has deliberately decided about are
 * listed in ACCEPTED below, each with the reason, so that a waiver is a
 * written decision rather than a silence.
 *
 *   node scripts/check-a11y.mjs
 *   node scripts/check-a11y.mjs --all   # include moderate and minor
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const AXE = "node_modules/axe-core/axe.min.js";
if (!existsSync(AXE)) {
  console.log("axe-core is not installed. Run: npm install --no-save axe-core");
  process.exit(1);
}

const ROUTES = ["/", "/journey", "/ride", "/help", "/shosholoza", "/ai", "/plan", "/stories"];
const SEVERITIES = process.argv.includes("--all")
  ? ["critical", "serious", "moderate", "minor"]
  : ["critical", "serious"];

/**
 * Violations this app has looked at and decided about.
 *
 * Each entry needs a reason. An empty list is the goal; an entry without a
 * reason is a silence pretending to be a decision.
 */
const ACCEPTED = new Map([
  // e.g. ["colour-contrast-on-the-vignette", "reason"]
]);

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
  ".glb": "model/gltf-binary", ".hdr": "image/vnd.radiance",
  ".webmanifest": "application/manifest+json",
};

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  let file = join("dist", normalize(decodeURIComponent(url.pathname)));
  if (!existsSync(file) || extname(file) === "") file = join("dist", "index.html");
  try {
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const executablePath = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find(candidate => candidate && existsSync(candidate));

const axeSource = readFileSync(AXE, "utf8");

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
  server.close();
  console.log(
    `SKIP  this check did NOT run - no Chromium on this machine\n` +
    `      (${error?.message?.split("\n")[0] ?? error})\n` +
    `      Run \`npx playwright install chromium\` to enable it.`,
  );
  process.exit(0);
}


for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("st.trip.v1", JSON.stringify({
        boardId: "pretoria", alightId: "cape-town",
        date: "2026-09-22", direction: "southbound",
      }));
    } catch { /* private mode */ }
  });

  for (const route of ROUTES) {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1100);
    await page.addScriptTag({ content: axeSource });

    const results = await page.evaluate(async severities => {
      const run = await window.axe.run(document, {
        resultTypes: ["violations"],
        // The canvas is a rendered 3D scene; axe has nothing to say about its
        // pixels, and the page around it carries the accessible description.
        rules: { "color-contrast": { enabled: true } },
      });
      return run.violations
        .filter(violation => severities.includes(violation.impact))
        .map(violation => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          count: violation.nodes.length,
          example: violation.nodes[0]?.html?.slice(0, 120) ?? "",
          /*
           * The measured colours, not just the rule name.
           *
           * "colour-contrast, ten times" is not actionable; "#8a8070 on
           * #f8f2e8 is 3.49:1, selector .home-stop-card__province" is. axe
           * already has the numbers - this surfaces them so a fix can be
           * made once, at the right declaration, instead of guessed at.
           */
          cases: violation.nodes.slice(0, 6).map(node => {
            const data = node.any?.[0]?.data ?? {};
            return data.fgColor
              ? `${node.target.join(" ")} — ${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}:1`
              : node.target.join(" ");
          }),
        }));
    }, SEVERITIES);

    const reported = results.filter(violation => !ACCEPTED.has(violation.id));
    check(
      `${route} (${scheme}) has no serious accessibility defects`,
      reported.length === 0,
      reported.map(v => `${v.impact}: ${v.id} — ${v.help} (${v.count}×)\n        ${v.cases.join("\n        ")}`).join("\n        "),
    );
  }
  await context.close();
}

await browser.close();
server.close();

console.log(failures === 0 ? "\naccessibility clean" : `\n${failures} accessibility problem(s)`);
process.exitCode = failures === 0 ? 0 : 1;
