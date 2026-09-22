/**
 * The project's test runner.
 *
 * These suites are plain TypeScript with no test framework: esbuild bundles
 * each one for Node and runs it. A suite prints one line per assertion and
 * exits non-zero if any failed, so CI, Netlify or a person at a terminal all
 * get the same answer. Adding a suite means adding a file below.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Find esbuild's own binary rather than going through `npx`.
 *
 * `execFileSync("npx", …)` cannot work on Windows, where npx is `npx.cmd` and
 * not something Node can spawn directly. The whole team is on Windows, so the
 * suite reported every file as failing for a reason that had nothing to do with
 * the code.
 *
 * The binary also does not live in the same place on every platform: esbuild
 * ships it at `<pkg>/bin/esbuild` on Unix and at `<pkg>/esbuild.exe` on
 * Windows. Probe for it rather than guessing, and fall back to npm's own shim
 * (which IS launchable through a shell) if the layout ever changes again.
 */
const ESBUILD = (() => {
  const pkg = join(process.cwd(), "node_modules", "@esbuild", `${process.platform}-${process.arch}`);
  const candidates = process.platform === "win32"
    ? [join(pkg, "esbuild.exe"), join(pkg, "bin", "esbuild.exe")]
    : [join(pkg, "bin", "esbuild")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { command: candidate, shell: false };
  }
  const shim = join(process.cwd(), "node_modules", ".bin",
    process.platform === "win32" ? "esbuild.cmd" : "esbuild");
  if (existsSync(shim)) return { command: shim, shell: process.platform === "win32" };
  return { command: "npx", shell: true, viaNpx: true };
})();

/** Every suite, in the order a person would want to read the results. */
const SUITES = [
  ["corridor",  "src/lib/__tests__/corridor.test.ts"],
  ["facts",     "src/lib/__tests__/corridor-facts.test.ts"],
  ["clock",     "src/lib/__tests__/journeyClock.test.ts"],
  ["storage",   "src/lib/__tests__/storage.test.ts"],
  ["guide",     "src/lib/__tests__/guide.test.ts"],
  ["shosholoza","src/lib/__tests__/shosholoza.test.ts"],
  ["sun",       "src/lib/__tests__/sunSky.test.ts"],
  ["update",    "src/lib/__tests__/appUpdate.test.ts"],
  ["demo",      "src/lib/__tests__/demoOffline.test.ts"],
];

const out = mkdtempSync(join(tmpdir(), "st-tests-"));
let failed = 0;

for (const [name, entry] of SUITES) {
  const bundle = join(out, `${name}.mjs`);
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 60 - name.length))}`);
  try {
    const args = [entry, "--bundle", "--platform=node", "--format=esm",
      `--outfile=${bundle}`, "--log-level=error"];
    execFileSync(ESBUILD.command, ESBUILD.viaNpx ? ["esbuild", ...args] : args,
      { stdio: "inherit", shell: ESBUILD.shell });
    execFileSync(process.execPath, [bundle], { stdio: "inherit" });
  } catch (error) {
    // Say why. A suite that fails silently is indistinguishable from a suite
    // that failed because the tooling could not start, which is exactly the
    // confusion this runner caused on Windows.
    console.error(`  ${name} did not complete: ${error?.message ?? error}`);
    failed += 1;
  }
}

console.log(failed ? `\n${failed} suite(s) failed` : "\nall suites passed");
process.exit(failed ? 1 : 0);
