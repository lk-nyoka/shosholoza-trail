# Master plan — make the ride legible, beautiful and local

**This supersedes `CODEX_RIDE_WORLD_PLAN.md`, `CODEX_LEGIBILITY_PLAN.md` and
`CODEX_BEAUTY_LOCAL_PLAN.md`.** One document, one order of work.

Every technique below is an established solution with a named source. **Do not invent an
approach where one is listed.** Copy the referenced implementation, then adapt.

---

## The problem, stated precisely

The geometry is real and correct, and that is now the problem:

1. **Satellite at grazing angle is noise.** A 200 km Karoo transit renders as smeared mud; one
   reservoir fills half the frame and nothing else reads.
2. **Real distances hide the content.** Attractions sit up to 10 km off the corridor. At true
   scale they are never visible, so "2 billboards lit" and you can see neither.
3. **The animations look generic.** They are procedurally drawn vector motifs, so every place
   looks like every other place.
4. **Nothing says South Africa.** Grey boxes and editorial chrome. It could be anywhere.

---

## The toolchain — all free, all widely used, all verified

| Need | Use | Why this one | Cost |
|---|---|---|---|
| Terrain beauty | **Imhof / Swiss shaded relief** | The most admired terrain rendering tradition; exact recipes published by Esri and John Nelson | Free |
| Vector world | **OpenFreeMap** (`tiles.openfreemap.org`) | 111-layer Liberty style with `building`, `landuse`, `water`, `rail`, `poi` already authored. **No key, no account.** Verified 200 OK | Free |
| Depth for parallax | **Depth Anything V2** | Current best monocular depth. 24.2M params @ 20 FPS vs MiDaS 344M @ 11 FPS; far better at range (0.37 m vs 5.35 m error at 15 m) | Free |
| Animation engine | **GSAP** | Went **100% free including all plugins** (MorphSVG, DrawSVG, SplitText, ScrollTrigger) after Webflow's 2024 acquisition. 11M production sites | Free |
| 3D models | **Kenney · Quaternius · Poly Haven · KayKit** | All CC0, **no attribution required**, all ship GLTF/GLB ready to drop in | Free |
| three.js on the map | **MapLibre's own example**, or **ThreeLibre** / `maplibre-three-plugin` | Official example is the safest; the plugins add camera sync and animation helpers | Free |
| Landmark imagery | **The 9 Commons photos you already ship** | Licensed, credited, and of the real places | Free |

Nothing here needs a card, a signup, or a quota.

---

## Phase 1 — Kill the noise: Imhof relief (start here)

Biggest single gain. Replaces both the ugliness and the noise in one pass.

Copy the exact colour values and layer order from
[Esri — Steal this Imhof-Like Topography Style](https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/steal-this-imhof-like-topography-style-please)
and [John Nelson's Imhof how-to](https://adventuresinmapping.com/2020/02/28/condensed-how-to-updated-imhof-style-map-of-switzerland/).

**A working starting point already exists in this repo** — I wrote and verified
`app/src/imhof-relief.ts`. Use it, do not rewrite it. It desaturates the imagery, adds warm
hillshading, and drives sky/fog from elevation. Two capture passes proved the numbers:

```js
'raster-saturation': -0.32,      // -0.5 was too dark, measured
'raster-contrast': 0.04,
'raster-brightness-max': 1,
'hillshade-exaggeration': 0.5,
'hillshade-shadow-color': '#4a3b2a',    // warm shadow, never grey — the whole trick
'hillshade-highlight-color': '#fff2d8',
```

**Extend it to:**
- Apply on **all** basemaps, not just the ride.
- **Zoned imagery:** full-saturation satellite within 4 km of a hub, relief everywhere else,
  cross-fading `raster-opacity` over ~1.5 km. The world *resolves* as you arrive — the
  transition reads as intentional design.
- **Golden hour by default** and drive `hillshade-illumination-direction` from the real sun
  azimuth, not a fixed 315°.

### The South African hypsometric ramp — this is the localisation
Colour must tell a passenger where in the country they are:

| Elevation | Where | Colour |
|---|---|---|
| 0–200 m | Cape lowlands, fynbos | `#6b7f5e` |
| 200–500 m | Breede valley | `#8a9463` |
| 500–1 000 m | Karoo approach | `#b08a5c` |
| 1 000–1 400 m | Karoo plateau | `#c08a5a` |
| 1 400–1 700 m | Highveld | `#c9a86a` |
| 1 700 m+ | Escarpment | `#8c6b4a` |

Already implemented as sky/fog bands in `imhof-relief.ts`. **Acceptance:** a Karoo transit
frame where no single feature dominates and the gold route is the brightest thing on screen.

---

## Phase 2 — Make the far things visible: compress the world, honestly

This is standard open-world practice. Designers **"compress landmarks, objectives and
interesting features so players spend less time traversing empty space"** and **"prioritise
fidelity for key locations and compress transit zones."** Navigation research: **"landmarks
should be visible at all the scales in which navigation takes place."**

**Hard rule:** the *data* stays real. `route-ride.geojson`, `hubs.json`, every coordinate and
source untouched. Only the *presentation* compresses, and the UI says so. A caption —
*"shown at 3× scale · actual distance 8.2 km"* — turns a cheat into a defensible design
decision. Add a `presentation` block beside the measured value, never overwriting it.

1. **Lateral pull-in.** Draw attractions clamped ~600 m from the track on the correct bearing,
   labelled with true distance.
2. **Vertical exaggeration for heroes.** Render Kimberley headgear, Lord Milner, Table Mountain
   at 2–3× height, disclosed. Zelda does exactly this with tall secondary landmarks.
3. **Three-stage approach.** 5 km faint marker → 2 km brightens and names itself → 500 m blooms
   and becomes tappable. Anticipation is the missing feeling.
4. **Screen-edge clamping** with direction arrow and distance for off-screen POIs. Standard game
   HUD.
5. **Bearing ribbon** across the top with ticks per landmark, so free-look becomes purposeful
   and "look left through the Hex" is discoverable rather than a surprise.
6. **Variable pacing.** ~200 m steps near hubs so you can look; 5–15 km through emptiness.
   Auto-ride accelerates through nothing and decelerates on approach.

---

## Phase 3 — Real 3D objects, three proven ways (no modelling from scratch)

You asked how to build 3D from satellite and Google imagery. You do not. Use what the games
industry uses.

**a) Billboard impostors — the workhorse.** A camera-facing textured quad, indistinguishable
from geometry at distance. Cut the subject from the Commons photo you already ship to a
512 px transparent PNG; place as a `symbol` layer with `icon-pitch-alignment: 'viewport'`,
`icon-allow-overlap: true`, `icon-size` interpolated by zoom. Keep the photo credit on it.
**Twelve impostors is one afternoon and it populates the whole corridor.**

**b) CC0 GLTF models for anything generic.** Do not model a train, a windpump or a water tank.
[Kenney](https://kenney.nl/), [Quaternius](https://quaternius.com/),
[Poly Haven](https://polyhaven.com/) and KayKit all ship GLB, all CC0, **no attribution
required**. Load through MapLibre's
[three.js on terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/)
or [ThreeLibre](https://github.com/piemonSong/threelibre).

**c) OSM extrusion for towns.** Already working via OpenFreeMap. Keep the 6 m height fallback —
Karoo towns have footprints but no height tags, and without it Matjiesfontein renders as flat
paint.

**Only three things deserve bespoke geometry:** the train, the Big Hole (a torus depression in
the terrain), and the Matjiesfontein street.

### Set dressing that could only be this route
Southern Cross windpumps (real positions from OSM `man_made=windpump`) · telegraph poles every
60 m · flat-topped dolerite koppies · aloe ferox in the Karoo · vineyard rows in the Breede ·
jacaranda canopy at Pretoria · Cape Dutch gables at Worcester · sheep and springbok near
Beaufort West.

---

## Phase 4 — Animation that is actually good

The scenes look generic because they are generated shapes. Replace the method.

### a) Depth-map parallax — the technique behind every "living photo"
Depth estimation separates a flat image into layers animated at different rates, simulating a
real camera move from one still frame.

**Pipeline, run once, offline:**
1. Run each of the 9 photographs through **Depth Anything V2** (free, local Python).
2. Ship `photo.webp` + `photo-depth.webp` (greyscale, ~30 KB each).
3. A small WebGL shader displaces the photo by the depth map against a slow virtual camera.
   Foreground drifts, background holds. The photograph gains real volume.
4. Layer the existing interpretive motif **on top at low opacity** — the spiral becomes an
   accent on a genuinely moving image, not the whole show.

Manual fallback if the model is too much: three hand-cut layers (sky / mid / fore) per photo,
per [Pat David's free-software tutorial](https://patdavid.net/2014/02/25d-parallax-animated-photo-tutorial/).

### b) Drive it with GSAP, not hand-rolled rAF
GSAP is now **completely free including every plugin**. Use `timeline()` for the per-place
camera choreography, `DrawSVG` for stroke-on effects, `MorphSVG` for shape transitions,
`SplitText` for the arrival titles. It is the industry default for exactly this.

### c) A distinct camera move per place — no shared preset

| Hub | Move |
|---|---|
| Kimberley | Slow push *into* the crater, rim parallaxing outward |
| Matjiesfontein | Lateral dolly along the street, veranda posts sliding past |
| Beaufort West | Slow tilt up from scrub to koppie line |
| De Aar | Push along converging rails to the vanishing point |
| Worcester | Rise over the Hex escarpment |
| Cape Town | Pull back to reveal Table Mountain |
| Pretoria | Drift up through jacaranda canopy |
| Johannesburg | Slow rise past towers |

**Acceptance:** play any two scenes side by side. If you cannot tell which place is which
without reading the caption, it has failed.

---

## Phase 5 — Local identity: SAR poster chrome, and sound

**The 1930s South African Railways "Land of Sunshine" posters** are a real, specific, local
design heritage — flat colour blocks, romantic landscape, heavy tracked capitals, tight
palette. Nobody else will use it.

Apply to arrival cards, the collection strip (enamel station-sign styling), loading and offline
screens, and chapter covers. Leave the evidence console plain and technical — the contrast is
the point.

Five colours only: `#1e3d34` rail green · `#c9a227` brass gold · `#b4552d` Karoo rust ·
`#f0e6d2` bone · `#12181f` night.

**Sound — use Shosholoza itself.** The song is about this exact journey: the train carrying
migrant workers to the mines. A low percussive pulse locked to travel speed on its
call-and-response cadence; regional ambience (Highveld hum, Karoo wind and cicadas, Cape
gulls); one warm note on discovery. **And silence in the waiting state** — when the train
stops, the rhythm stops. That absence is the strongest sound design in the product.

*Rights:* the melody is traditional but recordings are copyrighted. Record an original
percussion motif or use CC0 ambience from Freesound. Log it in the source register.

---

## Order of work

1. **Phase 1** — Imhof relief everywhere + zoned satellite + golden hour. Start here.
2. **Phase 2** — approach markers, edge clamping, bearing ribbon, lateral pull-in, pacing.
3. **Phase 4a/b** — Depth Anything V2 parallax on Kimberley, Matjiesfontein, Beaufort West first.
4. **Phase 3a** — billboard impostors and set dressing.
5. **Phase 5** — poster chrome, then audio.
6. **Phase 3b** — CC0 models and the train. Cut this first if time runs short.

After each phase:
```
npm test && npm run check && npm run check:app && npm run security:scan
npx vite build && node scripts/build-assets.mjs
```

Required artefacts: `evidence/legible-karoo-transit.png`, `evidence/legible-hub-approach.png`,
`evidence/parallax-kimberley.webm`, `evidence/impostors-matjiesfontein.png`.

**Two failure conditions that override any passing test:** a transit frame where one smeared
field dominates, and a frame that could be anywhere in the world.

---

## Still outstanding, do not lose

- The arrival card covers ~⅓ of the ride frame and does not dismiss on Escape.
- `app/src/imhof-relief.ts` and the `Ride.tsx` wiring are **uncommitted** — commit before editing
  that file or the work is lost.

---

## Sources

- [Esri — Steal this Imhof-Like Topography Style](https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/steal-this-imhof-like-topography-style-please)
- [John Nelson — Imhof-style how-to](https://adventuresinmapping.com/2020/02/28/condensed-how-to-updated-imhof-style-map-of-switzerland/)
- [Swiss-style relief shading methodology, ICA](https://icaci.org/files/documents/ICC_proceedings/ICC2009/html/nonref/25_4.pdf)
- [OpenFreeMap](https://openfreemap.org/) — keyless vector tiles
- [Depth Anything V2](https://arxiv.org/html/2406.09414v1) · [Roboflow — best depth models](https://blog.roboflow.com/depth-estimation-models/)
- [Waxy — photos into 2.5D parallax with ML](https://waxy.org/2019/11/turning-photos-into-2-5d-parallax-animations-with-machine-learning/)
- [Pat David — 2.5D parallax tutorial (free software)](https://patdavid.net/2014/02/25d-parallax-animated-photo-tutorial/)
- [Webflow — GSAP is now 100% free](https://webflow.com/blog/gsap-becomes-free) · [GSAP](https://github.com/greensock/GSAP)
- [Kenney](https://kenney.nl/) · [Quaternius](https://quaternius.com/) · [Poly Haven](https://polyhaven.com/) · [awesome-cc0](https://github.com/madjin/awesome-cc0)
- [MapLibre — three.js models on terrain](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/) · [ThreeLibre](https://github.com/piemonSong/threelibre)
- [Design Guidelines for Landmarks in Virtual Environments](https://arxiv.org/pdf/cs/0304001)
- [Inside Open-World Game Development](https://www.techtimes.com/articles/314497/20260206/inside-open-world-game-development-how-game-design-process-creates-immersive-maps-npc-systems.htm)
- [Forced perspective](https://en.wikipedia.org/wiki/Forced_perspective)
