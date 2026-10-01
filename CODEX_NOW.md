# CODEX_NOW — the only plan to follow

**This supersedes every other `CODEX_*.md` in this repo.** Move the rest to `docs/archive/`.
Nine plan files means guessing which one is current; there is now one.

---

## Toolchain — only what Codex can actually drive

| Tool | Status | Use |
|---|---|---|
| **Blender 5.2.1 LTS** headless | ✅ verified, Python 3.13.13 | **Rendered sprites only** — see the rule below |
| **Depth Anything V2** | ✅ 9/9 depth maps generated | Hub scene parallax |
| **GSAP 3.15.0** | ✅ installed | All animation choreography |
| **three.js + GLTFLoader** | ✅ in `train-3d.ts` | 3D on the map |
| **Playwright** | ✅ | Evidence capture |
| **Python 3.12.7** | ✅ | Data pipelines |
| **OSM / OpenFreeMap / Esri / Mapzen** | ✅ keyless | World data |

### The Blender rule

> **Use Blender when the output is a flat rendered image. Skip it when extrusions already work.**

Sprites: yes. The train: **no, not now.** The extrusion rake already produces an 18-vehicle
consist in correct livery, articulating on real geometry. A GLB would only improve close-range
detail, at the cost of a GLB loading path, LOD switching, triangle budgeting and API-drift risk
on a Blender release three weeks old. **The train is not the weakest thing in this project.
The empty Karoo is.**

**Dropped — do not attempt:**
- **Rive** — needs a Rust toolchain that is not installed, and the only authoring CLI is an
  unofficial community tool with no Windows guarantee. Re-authoring the same abstract motifs as
  JSON would not fix "generic". Remove the Rive lane from `assets/incoming/README.md`.
- **After Effects** — not installed, and it outputs video, wrong for an offline PWA.
- **Spline** — GUI only. Leave `assets/incoming/spline/` as an optional human lane, but build
  nothing that depends on it.

**Hub animations are depth-map parallax + GSAP.** The quality comes from the photographs being
real, not from the animation format.

---

## Step 0 — Commit. Now.

`train-model.ts`, `train-3d.ts`, `train-camera.ts`, the modified `ride-world.ts`, both capture
harnesses and the train evidence are **all uncommitted**, last commit 23:31. Commit before
anything else.

---

## Task 1 — Finish the train's *shots* (no Blender, no new assets)

`evidence/train-hero-pretoria.png` already shows an 18-vehicle rake in correct turquoise /
yellow / violet livery articulating through the Pretoria yard. The model is fine. What is
missing is proof, in three captures:

1. **A true hero shot** — low three-quarter angle, train filling **30–35% of frame width**.
   Every existing capture is high aerial, which is why it still reads as a coloured ribbon.
2. **A night shot where lit windows are clearly visible and not uniform.**
   `train-stage2-night-karoo.png` currently shows almost no train.
3. **Confirm the three-layer silhouette renders** — charcoal underframe / livery body / inset
   grey roof — and add the dark window band so vehicles have a waistline at mid distance.

**Acceptance:** hero shot placed beside `public/assets/photos/hero-train.webp`. Same train, or
it fails. **Do not build a GLB for this task.**

---

## Task 2 — Impostor sprites (Blender, and this is now the priority)

This is the one job only Blender can do, and it fixes your loudest remaining weakness: the
world is empty. It serves Pretoria *and* the whole corridor.

`assets/blender/build_impostors.py` — for each prop: simple geometry, sun matched to the ride's
golden-hour azimuth, render **orthographic, transparent PNG, 512²**, plus a JSON manifest of
names and real-world heights.

```
jacaranda_full    10 m   purple canopy, dark trunk      (Pretoria)
windpump           8 m   Southern Cross farm windmill   (corridor-wide, the Karoo signature)
telegraph_pole     8 m   (corridor-wide, instant railway)
aloe_ferox         2 m   (Karoo stretches)
street_lamp        6 m   (towns)
```

Then in `ride-world.ts`, place them as a `symbol` layer with
`icon-pitch-alignment: 'viewport'`, sized by real height so they scale correctly with distance.
Pull real windpump positions from OSM `man_made=windpump` where they exist and scatter more
between them. **Seed every scatter deterministically** so screenshots are reproducible.

**Acceptance:** `evidence/karoo-populated.png` — a transit frame that is no longer an empty
field. Windpumps and telegraph poles visible against the horizon.

---

## Task 3 — Pretoria, finished properly

### 3a. Depth parallax
`app/src/photo-parallax.ts` is committed WIP and `pretoria-depth.webp` exists (17 KB, richest
of the nine). Finish it **for Pretoria only**.

- Displace `pretoria.webp` by its depth map against a slow virtual camera.
- Move: **slow drift upward through the jacaranda canopy**, foreground branches parallaxing
  faster than the street behind. ~12 s, ease-in-out, then hold.
- **GSAP timeline**, not hand-rolled rAF.
- Existing vector motif drops to **≤25% opacity**. The photograph is the subject.
- Credit stays: *Paul Saad · CC BY-SA 4.0*.
- `prefers-reduced-motion` → a complete still frame, never blank.

### 3b. Jacaranda in the 3D approach
Scatter `jacaranda_full` from Task 2 along the Pretoria approach.

### 3c. Fix the arrival card
Covers ~⅓ of the ride frame and does not dismiss on `Escape`. Cap at ~34% width on desktop,
bottom sheet on mobile, wire `Escape`, add a visible close control.

**Acceptance:** `evidence/pretoria-parallax.webm` (10 s, 60 fps) and
`evidence/pretoria-approach.png` showing canopy in the 3D world.
**If the Pretoria scene could be swapped with any other hub unnoticed, it failed.**

---

## Task 4 — Roll the pattern out to the other seven

Only after Pretoria passes. Same pipeline, one distinct camera move each — no shared preset:

| Hub | Move |
|---|---|
| Kimberley | Push *into* the crater, rim parallaxing outward |
| Matjiesfontein | Lateral dolly along the street, veranda posts sliding past |
| Beaufort West | Tilt up from scrub to koppie line |
| De Aar | Push along converging rails to the vanishing point |
| Worcester | Rise over the Hex escarpment |
| Cape Town | Pull back to reveal Table Mountain |
| Johannesburg | Slow rise past the towers |

**Acceptance:** play any two side by side. If you cannot tell which place is which without the
caption, it failed.

---

## Optional, later — the train GLB

Only if Tasks 1–4 are done and time remains. `assets/blender/build_train.py`, primitives only,
real Cape-gauge dimensions, the naming contract in `CODEX_ASSET_PIPELINE.md`, AO baked, Draco,
**≤60k triangles or the script fails**. Wire as close LOD; keep the extrusion rake as far LOD.

Do not start this before Task 4.

---

## Standing rules

- **Commit after every task.** Do not accumulate hours of dirty tree.
- **Never block on `assets/incoming/`.** Build the coded version; upgrade only if a file appears
  and validates. Log and fall back on anything malformed.
- Every presentation compression stays **labelled** — scale exaggeration, pulled-in landmarks,
  terrain exaggeration, "interpretive motion on a licensed photograph, not footage".
- Route GeoJSON, `hubs.json` coordinates and all measurements stay **unchanged**.

Gates after each task:
```
npm test && npm run check && npm run check:app && npm run security:scan
npx vite build && node scripts/build-assets.mjs
```

Report per task: one line on what changed, pasted gate output, evidence paths.

---

## Still outstanding, do not lose

- `results/r3.json` — confirm it reflects the real alignment, not `synthetic-equator-v1`.
- **Deployment is stale: the live Worker is from 7 September.** Everything since — real rail
  geometry, Imhof relief, the ride, the train — exists only on this laptop.
- `wrangler secret list` returns `[]`. `MODERATOR_TOKEN` unset, so moderation returns 503.
  `MAPTILER_KEY` unset, so satellite runs on keyless Esri, which is fine.
