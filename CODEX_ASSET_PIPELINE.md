# Asset pipeline — adding the creative apps to Codex's workflow, headless only

**No GUI automation. No mouse. No screen-scraping.** Everything here is a command Codex runs
and a file contract it consumes.

## What is actually on this machine (verified)

| App | Status | CLI? | Who drives it |
|---|---|---|---|
| **Blender 5.2.1 LTS** | `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` | **Yes** — headless Python 3.13.13 confirmed working | **Codex** |
| **Spline** | `AppData\Local\Programs\Spline\Spline.exe` (Electron) | No authoring CLI | Human → exports `.glb` |
| **Rive** | Store/UWP package `com.flutter.riveeditor_*` (sandboxed) | No CLI at all | Human → exports `.riv` |
| **After Effects** | **Not installed** — no `aerender.exe`, no install folder | — | Skip |

Verified:
```
blender --background --python-expr "import bpy,sys; print(bpy.app.version_string)"
→ BPY_OK 5.2.1 LTS py 3.13.13
```

**Therefore: Blender is Codex's tool. Rive and Spline are human tools that hand Codex files.
Codex must never try to open Spline or Rive.**

---

## Rule 1 — Blender is invoked headless, always

```bash
BLENDER="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$BLENDER" --background --factory-startup --python assets/blender/build_train.py -- --out public/assets/models/consist.glb
```

- `--background` — no window, no GUI.
- `--factory-startup` — ignore user prefs so results are reproducible on any machine.
- Everything after `--` is passed to the script; parse with `sys.argv[sys.argv.index("--")+1:]`.

Add to `package.json`:
```json
"assets:train":     "node scripts/run-blender.mjs build_train",
"assets:pretoria":  "node scripts/run-blender.mjs build_pretoria",
"assets:impostors": "node scripts/run-blender.mjs build_impostors"
```

`scripts/run-blender.mjs` resolves the Blender path from `process.env.BLENDER_PATH` with the
installed path above as fallback, and **fails loudly** if absent. Generated binaries stay out
of the pack manifest until they are actually referenced.

---

# TASK A — The train (Blender, fully scripted)

`assets/blender/build_train.py`. Build from **primitives** — cubes, scaled and beveled. No
sculpting, no external model. This keeps the script short, diffable, and immune to Blender API
drift.

## Dimensions — real Cape gauge, metres, matching `train-model.ts`

```python
COACH_LENGTH, LOCO_LENGTH, GAP = 22.0, 19.0, 1.2
HALF_WIDTH, BOGIE_SPACING      = 1.52, 15.5
UNDERFRAME_TOP, BODY_TOP, ROOF_TOP = 1.1, 3.4, 4.0
WHEEL_RADIUS = 0.42
RAKE = ["loco", "loco"] + ["turquoise", "yellow", "violet"] * 5 + ["turquoise"]  # 2 + 16
```

## Livery — sampled from the photograph already in the repo

Ground truth is `public/assets/photos/hero-train.webp`. Whole coaches in single colours,
alternating.

```python
LIVERY = {
  "turquoise": (0.184, 0.659, 0.776),
  "yellow":    (0.922, 0.725, 0.216),
  "violet":    (0.494, 0.388, 0.659),
  "loco":      (0.545, 0.463, 0.722),
  "underframe":(0.227, 0.247, 0.271),
  "roof":      (0.663, 0.686, 0.710),
  "glass":     (0.114, 0.165, 0.200),
}
```
Linear-space floats, not sRGB hex. Set `roughness` 0.55–0.7, `metallic` 0.0 for painted
panels. Give the window material a low-strength **emission** slot so night lighting can be
driven at runtime.

## Object naming contract — this is the important part

`app/src/train-3d.ts` must find parts by name. Freeze this and do not deviate:

```
consist
├── vehicle_00_loco
│   ├── vehicle_00_body
│   ├── vehicle_00_underframe
│   ├── vehicle_00_roof
│   ├── vehicle_00_glass
│   ├── vehicle_00_pantograph
│   ├── vehicle_00_bogie_front
│   │   ├── vehicle_00_wheelset_f1
│   │   └── vehicle_00_wheelset_f2
│   └── vehicle_00_bogie_rear
│       ├── vehicle_00_wheelset_r1
│       └── vehicle_00_wheelset_r2
├── vehicle_01_loco   (same)
├── vehicle_02_coach  (same minus pantograph)
…
└── vehicle_17_coach
```

**Every vehicle is a separate top-level empty at the origin**, with its own local geometry.
The runtime positions each one independently by chainage — it must never receive one welded
393 m mesh. Bogies are child empties so they can rotate to their own local tangent; wheelsets
are children of bogies so they inherit that and spin on their own axis.

Origins matter: each vehicle's origin at its **centre between bogies**; each bogie's origin at
its **pivot centre**; each wheelset's origin at its **axle centre**. Wrong origins mean parts
orbit rather than rotate.

## Export

```python
bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB',
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_apply=False,          # keep modifiers live? No — see note
    export_yup=True,
)
```
Apply modifiers before export but **do not join objects** — joining destroys the hierarchy the
runtime depends on.

Also emit `public/assets/models/consist.meta.json`: vehicle count, per-vehicle livery, triangle
count, bounding box, and the source note that the livery derives from the credited photograph.
`train-3d.ts` reads this instead of hardcoding.

**Budget:** ≤60k triangles for the whole consist. Bevel at 2 segments, not 4. If it exceeds
budget the script should fail, not warn.

## Bake ambient occlusion

A flat-shaded box reads as a box. Bake AO to a single shared 2048² atlas
(`consist_ao.png`) and multiply it into base colour. This is the difference between "3D model"
and "toy".

## Acceptance
```
npm run assets:train
node -e "const m=require('./public/assets/models/consist.meta.json');console.log(m.vehicles,m.triangles)"
```
- 18 vehicles, ≤60k triangles.
- Loading in `train-3d.ts` finds every named part; log any miss as an error, never silently.
- Render one Blender preview to `evidence/consist-blender-preview.png` and place it beside
  `hero-train.webp`. Same train or it fails.

---

# TASK B — Pretoria (Blender + the parallax you already started)

Two halves. Do them in this order.

## B1 — Finish the depth parallax (no Blender needed)

`app/src/photo-parallax.ts` is committed WIP and `pretoria-depth.webp` already exists — 17 KB,
the richest of the nine, so plenty of depth signal. Finish that path **for Pretoria only**.

- Displace `pretoria.webp` by its depth map against a slow virtual camera.
- Move: **slow drift upward through the jacaranda canopy**, foreground branches parallaxing
  faster than the street beyond. ~12 s, ease-in-out, then hold.
- Drive the timeline with **GSAP** (now free including all plugins). Do not hand-roll rAF.
- Existing vector motif drops to **≤25% opacity**. The photograph is the subject.
- Keep the credit: *Paul Saad · CC BY-SA 4.0*.

## B2 — Jacaranda impostors for the 3D approach (Blender, scripted)

`assets/blender/build_impostors.py`. Pretoria's approach should have actual purple canopy in
the 3D world, not just in the card.

For each prop, build simple geometry, light it with a sun matching the ride's golden-hour
azimuth, render **orthographic, transparent PNG, 512²**, and write a sprite sheet plus a JSON
manifest of names and real-world heights.

Props for Pretoria:
```
jacaranda_full     10 m   purple canopy, dark trunk
jacaranda_bare      9 m   winter form, for non-October dates
street_lamp         6 m
telegraph_pole      8 m   (reused corridor-wide)
```

Then in `ride-world.ts`, scatter `jacaranda_full` as a `symbol` layer with
`icon-pitch-alignment: 'viewport'` along the Pretoria approach, sized by real height so they
scale correctly with distance. **Seed the scatter deterministically** so the same trees appear
in the same places on every run — a screenshot must be reproducible.

## B3 — Fix the arrival card while you are there
It covers ~⅓ of the ride frame and does not dismiss on `Escape`. Cap at ~34% width on desktop,
bottom sheet on mobile, wire `Escape`, add a visible close control.

## Acceptance
`evidence/pretoria-parallax.webm` (10 s, 60 fps) plus `evidence/pretoria-approach.png` showing
jacaranda canopy in the 3D world. Plus a reduced-motion still that is a complete frame.

**If the Pretoria scene could be swapped with any other hub's unnoticed, it failed.**

---

# The human lane — Spline and Rive

Codex does **not** touch these. A person authors; Codex consumes a file at a fixed path.

**Spline** → export **GLB** to `assets/incoming/spline/*.glb`. Good for landmark props that are
tedious to script: the Big Hole depression, the Lord Milner façade, the Kimberley headgear.
Same naming contract as above if the object needs moving parts. Codex re-exports through
Blender headless to apply Draco and the triangle budget — **never ship a Spline export
directly**.

**Rive** → export **`.riv`** to `public/assets/rive/<hub>.riv`. This is the right home for the
eight hub scene animations. Codex adds `@rive-app/canvas` and binds the state machine to app
state: `approaching`, `arrived`, `discovered`, `reduced-motion`. Runtime is ~200 KB and files
are kilobytes — it fits the offline pack, which video never would.

**After Effects is not installed.** If it is installed later, keep it for the demo-day pitch
video only. Its output is video: wrong for an offline-first PWA.

---

## Order

1. `scripts/run-blender.mjs` + `npm run assets:train` wired and failing loudly if Blender is missing.
2. Task A — the consist GLB, named, AO-baked, under budget.
3. Wire it into `train-3d.ts`, replacing the extrusion rake as the close LOD (keep the rake as the far LOD — it is cheap and already correct).
4. Task B1 — Pretoria parallax.
5. Task B2/B3 — jacaranda impostors, arrival card fix.
6. Stop and report with evidence.

Gates after each:
```
npm test && npm run check && npm run check:app && npm run security:scan
npx vite build && node scripts/build-assets.mjs
```

## Notes on cost

Blender headless runs take seconds to a couple of minutes and consume **no tokens** — Codex
issues one command and reads a short log. That is the entire point of this pipeline over GUI
automation. Keep the scripts primitive-based and the logs terse.

---

## Rule 0 — Codex never blocks on a human export

The team authors in Spline and Rive in parallel. Files arrive in `assets/incoming/` at
unpredictable times. Codex must be able to build a complete, shippable product at every
moment regardless of what has arrived.

1. **Always build the coded fallback first.** The extrusion rake, the coded hub scenes, the
   scripted Blender props. These are the product. Everything from `assets/incoming/` is an
   upgrade, never a dependency.
2. **Detect on build, do not poll.** At the start of `npm run build`, scan `assets/incoming/`.
   For each valid file found, register it and replace the fallback for that hub or prop only.
3. **Validate before adopting.** A `.riv` must expose artboard `scene`, state machine
   `SceneState` and the three boolean inputs. A `.glb` must be real-world metres with its
   origin at base centre and be within the triangle budget. If validation fails, **keep the
   fallback and log the exact reason** — never ship the broken asset, never stall waiting.
4. **Report what was adopted.** Print a short table at the end of the build: hub, source
   (`coded` / `rive` / `spline+blender`), size. That is how the team sees their export landed.
5. **Never open Spline or Rive.** They have no CLI. Codex reads their output files only.

The contract the team follows is `assets/incoming/README.md`. Do not change it without saying so.
