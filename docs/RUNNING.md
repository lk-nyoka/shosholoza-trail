# Run ShosholozaTrail locally

The new **3D animation** preview is `http://127.0.0.1:8787/animation`.
The separate satellite view remains `/ride?inspect=pretoria`. Use the view links
to switch. Animation assets are local; no external tile services are needed.

Run commands from `ShosholozaTrail`, not its parent folder or `../Repos`.
Node.js 22+ is required; the baseline was checked with Node 24.15.0.
The existing installed dependencies were sufficient; no reinstall was needed.

## Start this checkout

```powershell
npm.cmd run dev
```

Open **http://127.0.0.1:8787/**, or the URL Wrangler prints if the port changes.
For the current visual checkpoint, open:

**http://127.0.0.1:8787/ride?hub=pretoria**

Close the Pretoria arrival card, step forward, then try Auto ride. The first
departure takes 5.5 seconds at 1x. Small distances display in metres. Inspect
the current train, track alignment, camera and arrival card before the next
implementation phase.

PowerShell can block `npm.ps1`; `npm.cmd` avoids that problem. In shells where
`npm` works normally, the `.cmd` suffix is unnecessary. Stop the server with
Ctrl+C. This command runs locally; it does not deploy.

## Clean checkout / rebuilding after source changes

```powershell
npm.cmd ci
npm.cmd exec wrangler d1 migrations apply shosholoza-trail-pilot --local
npm.cmd run build
npm.cmd run dev
```

`npm ci` needs package-registry access on a clean machine. Do not reinstall just
to inspect this already-installed checkout. The `--local` migration targets the
local D1 database only. The current local health endpoint reports it available.

`build` writes the React frontend and packaged engine assets to `public/`, then
performs a Worker deployment **dry run**. Wrangler serves those built assets;
rebuild frontend changes before inspecting them there. `dev:app` runs Vite by
itself, but is not the integrated baseline: the Worker serves the backend and
shared public assets used by this application.

Stop Wrangler before rebuilding, then restart it. On this Windows checkout its
asset watcher can stop when Vite replaces the hashed bundle directory; an old
server can then return HTML for new JavaScript/CSS URLs. Restarting refreshes
the asset list. The visible Pretoria controls are at
`http://127.0.0.1:8787/ride?inspect=pretoria` (also linked as **Explore Pretoria**).

## Checks

```powershell
npm.cmd run check
npm.cmd run check:app
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

There is no configured lint script. The two TypeScript checks cover Worker and
React code separately. Browser tests launch a separate static harness at port
4173; leave that port free. Fixture-based AI tests do not prove the live provider
is responding. Baseline unit coverage is 58 passing tests.

The build currently warns about the large frontend chunk and external vendored
assets. The assets resolve through the Worker. Bundle splitting remains future
performance work, not a reason to suppress these warnings.

Baseline verification on 20 September 2026: build, both type checks and all 58
unit tests passed. The initial browser run exposed a shared route-test timeout
and two stale movement assertions. After the distance-display and test fixes,
all five ride tests and all nine route smoke tests passed in targeted reruns;
the other 19 browser tests passed in the initial run. The live-provider ride
smoke took 31.4 seconds on its final run, so cold map startup remains a measured
performance issue. A passing startup check does not imply fast loading.

## Service boundaries

- `/api/health` reports configuration and local database availability.
- Workers AI is configured as a remote binding. Wrangler may need existing
  Cloudflare authentication; AI requests use the account's allocation. Health
  reporting `configured-not-probed` is not a successful inference check.
- Satellite, elevation and vector context load from external map services.
  The packaged offline rail world does not contain those external tiles.
- The browser-test harness returns fallback responses for backend endpoints;
  use port 8787 for the integrated application.

## Adapted implementation direction

See `IMPLEMENTATION.md`. `reference-audit.md` is not a prerequisite or source of
instructions. The next phase incrementally separates the existing ride into
reusable modules, followed by a short Pretoria reference-led prototype and
visual checkpoints. The current screenshot is `../evidence/local-baseline-pretoria.png`;
it records the starting point, not acceptance of the intended new experience.

## Regenerating the animation's world data

The 3D animation ships three local data files so the page makes no network
request of its own. All three are built from sources that are keyless and free;
none need to be regenerated unless the route slice changes.

```bash
node scripts/build-animation-route.mjs   # 6.5 km slice of the corridor, ~18 KB
node scripts/fetch-osm-buildings.mjs     # 531 footprints from Overpass, ~80 KB
node scripts/fetch-osm-roads.mjs         # 431 road centrelines, ~132 KB
node scripts/fetch-terrain.mjs           # 160x160 elevation grid, ~170 KB
node scripts/fetch-osm-places.mjs        # named places the train passes, ~3 KB
node scripts/build-assets.mjs            # copies data/ into public/data/
```

The two Overpass scripts try `overpass-api.de` first and fall back to
`overpass.kumi.systems`. Elevation comes from Mapzen terrarium tiles on AWS Open
Data; `fetch-terrain.mjs` carries its own small PNG decoder, because Node has
none and terrarium tiles are the easy case (8-bit, non-interlaced). These three
are the only part of the build that touches the network, and all are keyless.

Map data © OpenStreetMap contributors, ODbL 1.0. Elevation: Mapzen terrarium
tiles (SRTM, NED and others, public domain).

### Kimberley chapter data

The same scripts build the Kimberley chapter. `ROUTE`, `TARGET`, `CORRIDOR`,
`MARGIN`, `GRID` and `MAX_BUILDINGS` override the Pretoria defaults; the
terrain margin is wide enough to take in the Big Hole, 1.1 km west of the line.

```bash
node scripts/build-kimberley-route.mjs       # 3 km before the station to 1.6 km after
ROUTE=data/route-kimberley.geojson TARGET=data/kimberley-terrain.json MARGIN=2000 GRID=240 node scripts/fetch-terrain.mjs
ROUTE=data/route-kimberley.geojson TARGET=data/kimberley-buildings.json CORRIDOR=1400 MAX_BUILDINGS=1400 node scripts/fetch-osm-buildings.mjs
ROUTE=data/route-kimberley.geojson TARGET=data/kimberley-roads.json CORRIDOR=1400 node scripts/fetch-osm-roads.mjs
node scripts/extract-kimberley-heritage.mjs  # platforms, yard, tramway, 25NC from data/provenance/kimberley.osm
node scripts/build-assets.mjs
```

`scripts/check-kimberley.mjs` runs the whole chapter in headless Chromium and
writes a frame per phase to `evidence/kimberley/`. Point `KIMBERLEY_BASE` at a
server that serves `/kimberley.html` and `/data`. Headless Chromium renders
with SwiftShader at 1-2 fps, so a full run takes about four minutes.

### Beaufort West chapter data

`data/provenance/beaufort-west.osm` is a full Overpass extract of the town. It
is not committed (it pulls in whole national rail relations, ~20 MB); the
derived `data/beaufort-west-town.json` is. To rebuild:

```bash
node scripts/build-beaufort-west-data.mjs   # route slice (splices a doubled-back loop) + station, yard, landmarks
ROUTE=data/route-beaufort-west.geojson TARGET=data/beaufort-west-terrain.json MARGIN=9000 GRID=300 node scripts/fetch-terrain.mjs
ROUTE=data/route-beaufort-west.geojson TARGET=data/beaufort-west-buildings.json CORRIDOR=1600 MAX_BUILDINGS=2500 node scripts/fetch-osm-buildings.mjs
ROUTE=data/route-beaufort-west.geojson TARGET=data/beaufort-west-roads.json CORRIDOR=1600 node scripts/fetch-osm-roads.mjs
node scripts/build-assets.mjs
```

The 9 km terrain margin brings in the Nuweveld escarpment behind the town.
`scripts/check-beaufort-west.mjs` (`BEAUFORT_BASE=...`) runs the story, the
landmark inspector and the platform stop; about three and a half minutes
headless.

Rendering the billboard sprites used by the satellite ride needs Blender:

```bash
node scripts/run-blender.mjs build_impostors
```


The Overpass scripts now refuse to write a file when a query times out (Overpass
reports this as HTTP 200 with a `remark`) or returns nothing, and fall through to
the next mirror. The terrain script refuses to bake if any tile is missing.
A failed fetch therefore leaves the existing data file untouched.
