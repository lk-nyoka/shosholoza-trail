/**
 * The Content-Security-Policy check.
 *
 * A CSP is the one piece of configuration whose mistakes are invisible: get
 * it wrong and the satellite imagery, the elevation tiles or the photographs
 * simply do not appear, with nothing on screen and nothing a passenger could
 * report. That is why the policy ships report-only. It is also why "we will
 * watch the reports for a week" is not a plan on a hackathon timeline.
 *
 * So instead of watching, this derives the origins the app ACTUALLY contacts
 * from the source and the built bundle, and checks the policy covers every
 * one of them under the right directive. Anything the app reaches that the
 * policy does not allow is reported here, before it is enforced, rather than
 * as a blank map on somebody's phone.
 *
 *   node scripts/check-csp.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const HEADERS = "public/_headers";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
};

// ── What the app reaches ──────────────────────────────────────────────────

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if ([".ts", ".tsx", ".html", ".css"].includes(extname(path))) out.push(path);
  }
  return out;
};

const sources = [...walk("src"), "index.html"];
const origins = new Set();
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/https:\/\/([a-zA-Z0-9.*-]+)/g)) {
    origins.add(match[1]);
  }
}

/**
 * Origins that appear in the source but are never contacted by the running
 * app: links a passenger clicks, and prose. A link is navigation, which no
 * fetch directive governs.
 */
const NAVIGATION_ONLY = new Set([
  "www.openstreetmap.org",
  "operations.osmfoundation.org",
  "www.seat61.com",
  "www.sahistory.org.za",
  "lucide.dev",
  "storied-cendol-2fcdaf.netlify.app",
  "commons.wikimedia.org",
  "www.youtube.com",
]);

/** Which directive each contacted origin has to be allowed under. */
const REQUIRED = {
  "server.arcgisonline.com": ["img-src", "connect-src"],
  "services.arcgisonline.com": ["connect-src"],
  "tiles.openfreemap.org": ["img-src", "connect-src"],
  "s3.amazonaws.com": ["connect-src", "img-src"],
  "api.openstreetmap.org": ["connect-src"],
  "*.wikimedia.org": ["img-src", "connect-src"],
  "*.supabase.co": ["connect-src"],
  "fonts.googleapis.com": ["style-src"],
  "fonts.gstatic.com": ["font-src"],
  "www.youtube-nocookie.com": ["frame-src"],
};

// ── The policy as written ─────────────────────────────────────────────────

const headers = readFileSync(HEADERS, "utf8");
// The file explains itself in comments that name the header, so a naive
// `includes` finds the prose rather than the policy.
const policyLine = headers
  .split("\n")
  .map(line => line.trim())
  .find(line => !line.startsWith("#") && /^Content-Security-Policy(-Report-Only)?\s*:/.test(line));
check("a policy is present", Boolean(policyLine), HEADERS);
if (!policyLine) process.exit(1);

const enforced = !policyLine.includes("Report-Only");
const policy = policyLine.slice(policyLine.indexOf(":") + 1).trim();
const directives = new Map();
for (const part of policy.split(";")) {
  const [name, ...values] = part.trim().split(/\s+/);
  if (name) directives.set(name, values);
}

const allows = (directive, origin) => {
  const values = directives.get(directive) ?? directives.get("default-src") ?? [];
  if (values.includes("*")) return true;
  return values.some(value => {
    const host = value.replace(/^https:\/\//, "").replace(/\/$/, "");
    if (host === origin) return true;
    // A wildcard entry covers its subdomains.
    if (host.startsWith("*.")) {
      const suffix = host.slice(1);
      return origin === host || origin.endsWith(suffix);
    }
    return false;
  });
};

// ── The checks ────────────────────────────────────────────────────────────

for (const [origin, needed] of Object.entries(REQUIRED)) {
  for (const directive of needed) {
    check(`${origin} is allowed under ${directive}`, allows(directive, origin), policyLine ? "not in the policy" : "");
  }
}

// Everything the source reaches must be accounted for, one way or the other.
for (const origin of [...origins].sort()) {
  if (NAVIGATION_ONLY.has(origin)) continue;
  check(
    `${origin} is a known, classified origin`,
    Object.prototype.hasOwnProperty.call(REQUIRED, origin),
    "add it to REQUIRED with its directive, or to NAVIGATION_ONLY if it is only ever a link",
  );
}

// The directives that make a policy worth having at all.
check("default-src is locked to self", (directives.get("default-src") ?? []).includes("'self'"), policy);
check("object-src is none", (directives.get("object-src") ?? []).includes("'none'"), policy);
check("base-uri is self", (directives.get("base-uri") ?? []).includes("'self'"), policy);
check("frame-ancestors is none", (directives.get("frame-ancestors") ?? []).includes("'none'"), policy);
check("form-action is self", (directives.get("form-action") ?? []).includes("'self'"), policy);
check("no unsafe-eval in script-src", !(directives.get("script-src") ?? []).includes("'unsafe-eval'"), policy);
check("no unsafe-inline in script-src", !(directives.get("script-src") ?? []).includes("'unsafe-inline'"), policy);
check(
  "wasm is allowed, because the vector tiles need it",
  (directives.get("script-src") ?? []).includes("'wasm-unsafe-eval'"),
  policy,
);
check("workers may come from blob:, because Three.js and the tile worker need it",
  (directives.get("worker-src") ?? []).includes("blob:"), policy);

// The other headers a scan looks for.
for (const header of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]) {
  check(`${header} is set`, headers.includes(header));
}
check("the shell is never cached", headers.includes("/index.html"));
check("the worker is never cached", headers.includes("/sw.js"));

// ── And then the browser's own opinion ────────────────────────────────────
//
// Everything above reasons about the policy text. This serves the built app
// with that exact header attached and lets a real browser enforce it, which
// is the only way to catch what a reading misses - an inline style Vite
// injects, a worker URL, a font the CSS asks for. Violations are collected
// from the browser's own `securitypolicyviolation` event, not from guesswork.
//
// `--no-browser` skips it, for an environment with no Chromium.

let browserChecked = false;
if (!process.argv.includes("--no-browser")) {
/**
 * No browser on this machine.
 *
 * The team works on Windows without a Playwright browser download, and this
 * check has to behave honestly there. It does not fail - a missing browser is
 * not a defect in the app - and it does not quietly pass either, which would
 * be reporting a verification that never ran. It says what it did not check.
 */
  const { chromium } = await import("playwright");
  const { createServer } = await import("node:http");
  const { normalize } = await import("node:path");
  const { existsSync } = await import("node:fs");

  const TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
    ".glb": "model/gltf-binary", ".hdr": "image/vnd.radiance",
    ".webmanifest": "application/manifest+json",
  };

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let file = join("dist", normalize(decodeURIComponent(url.pathname)));
    if (!existsSync(file) || extname(file) === "") file = join("dist", "index.html");
    try {
      response.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        // The header exactly as Netlify will send it.
        "content-security-policy": policy,
      });
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

  let browser = null;
  try {
    browser = await chromium.launch({
      args: ["--no-sandbox"],
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (error) {
    server.close();
    console.log(
      `SKIP  the browser pass did NOT run - no Chromium on this machine\n` +
      `      (${error?.message?.split("\n")[0] ?? error})\n` +
      `      Run \`npx playwright install chromium\` to enable it. The policy text\n` +
      `      above was still checked; what a browser would have caught was not.`,
    );
  }
  if (browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", event => {
      // One line per directive-and-origin: a blocked tile server produces a
      // hundred identical violations, and the hundredth says nothing the
      // first did not.
      let origin = event.blockedURI;
      try { origin = new URL(event.blockedURI).origin; } catch { /* keep as-is */ }
      window.__cspViolations.push(`${event.violatedDirective} blocked ${origin}`);
    });
    try {
      localStorage.setItem("st.trip.v1", JSON.stringify({
        boardId: "pretoria", alightId: "cape-town",
        date: "2026-09-22", direction: "southbound",
      }));
    } catch { /* private mode */ }
  });

  for (const route of ["/", "/ride", "/journey", "/help", "/shosholoza"]) {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const violations = await page.evaluate(() => [...new Set(window.__cspViolations ?? [])]);
    check(`${route} runs under the enforced policy`, violations.length === 0, violations.join("; "));
  }

    await browser.close();
    server.close();
    browserChecked = true;
  }
}

console.log(
  failures === 0
    ? `\npolicy clean (${enforced ? "ENFORCED" : "report-only"})${browserChecked ? "" : " - policy text only, NOT verified in a browser"}`
    : `\n${failures} policy problem(s)`,
);
process.exitCode = failures === 0 ? 0 : 1;
