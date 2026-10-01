// Headless Blender runner.
//
// Blender is driven with --background so no window ever opens and no GUI
// automation is involved. --factory-startup ignores local user preferences so a
// render is reproducible on any machine.
//
//   node scripts/run-blender.mjs build_impostors [-- extra args]
//
// Override the executable with BLENDER_PATH when it is installed elsewhere.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATES = [
  process.env.BLENDER_PATH,
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  '/usr/bin/blender',
  '/Applications/Blender.app/Contents/MacOS/Blender',
].filter(Boolean);

const blender = CANDIDATES.find((p) => existsSync(p));
if (!blender) {
  console.error('Blender not found. Set BLENDER_PATH, or install Blender.');
  console.error('Looked in:\n  ' + CANDIDATES.join('\n  '));
  process.exit(1);
}

const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/run-blender.mjs <script-name> [-- args]');
  process.exit(1);
}

const script = resolve('assets/blender', `${name}.py`);
if (!existsSync(script)) {
  console.error(`No such Blender script: ${script}`);
  process.exit(1);
}

const passthrough = process.argv.slice(3);
const args = ['--background', '--factory-startup', '--python', script];
if (passthrough.length) args.push('--', ...passthrough);

console.log(`blender: ${blender}`);
console.log(`script:  ${script}`);

const run = spawnSync(blender, args, { stdio: 'inherit' });
if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}
process.exit(run.status ?? 1);
