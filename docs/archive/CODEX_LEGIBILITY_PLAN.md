# Strategy — make the real world legible: noise, distance, landmarks, animation

The geometry is real and correct. That is now the problem. Real measurements mean the
attractions are kilometres off the corridor and invisible, and raw satellite over 200 km of
Karoo is visual noise. The ride is accurate and unreadable at the same time.

This is a known problem with a known answer.

## The governing principle: fidelity where it matters, abstraction where it does not

Open-world designers do not model real distances. They **"compress landmarks, objectives and
interesting features so players spend more time doing meaningful activities and less time
traversing empty space"**, and they **"prioritize fidelity for key locations and compress
transit zones, yielding a believable yet playable world."** Navigation research is equally
blunt: **"landmarks should be visible at all the scales in which navigation takes place."**

Beck's Tube map is the same trick and it is the most copied diagram in the world. It lies
about distance to tell the truth about the journey.

**The hard rule for this project:** the *data* stays real — `route-ride.geojson`,
`hubs.json`, every coordinate, every source. Only the **presentation** compresses, and the
interface always says so. A visible line of copy — "landmarks shown at 3× scale · actual
distance 8.2 km" — costs nothing and converts a cheat into a design decision you can defend
to a judge.

---

## Fix 1 — Kill the noise: stop drawing satellite where there is nothing to see

The screenshot that prompted this is a smeared blue-grey field filling half the frame. That
is a reservoir at grazing angle, and it is the single loudest thing on screen.

### Two ground treatments, switched by context

| Zone | Ground | Why |
|---|---|---|
| Within 4 km of a hub or attraction | **Esri satellite, full saturation** | Where detail is real and meaningful |
| Everything else (~90% of the route) | **Stylised vector landcover** from OpenFreeMap | Clean, poster-like, zero noise |

You already load OpenFreeMap. It has `landcover_wood`, `landcover_grass`, `landuse_*`,
`water`, `park`. Fill them with a five-colour Karoo palette — burnt ochre, rust, olive, bone,
deep indigo — and the world becomes a designed landscape instead of a muddy photograph.

Cross-fade `raster-opacity` 0 → 1 over ~1.5 km as you approach a hub. The transition itself
reads as intentional: the world *resolves* as you arrive.

### If you keep satellite in transit zones, tame it
```js
paint: {
  'raster-saturation': -0.55,   // pull the colour out so 3D objects pop
  'raster-contrast': -0.15,     // flatten the mud
  'raster-brightness-max': 0.78,
  'raster-opacity': 0.85,
}
```
Desaturated ground + a saturated gold route + lit landmarks = the eye goes where you want.

**Acceptance:** a Karoo transit screenshot must have no single feature dominating the frame,
and the route line must be the brightest thing in it.

---

## Fix 2 — Compress the journey, honestly

1,582 km at real scale is 90% nothing. Two mechanisms, both standard:

**Variable pacing.** Step size is not constant. Near a hub (±10 km) each step is ~200 m so you
can look around. In open transit each step is 5–15 km. Auto-ride accelerates through emptiness
and decelerates on approach — the same easing a film uses between scenes. The distance readout
stays truthful throughout.

**Lateral pull-in.** Attractions sit up to 10 km off the corridor and will never be seen. Draw
them at a *presentation position* clamped to ~600 m from the track, on the correct bearing,
with the true distance in the label. The record in `hubs.json` keeps the real coordinate; only
the marker moves. Label it: *"Big Hole · 2.1 km left of the line, shown closer."*

This is forced perspective — **"optical illusion to make objects appear farther, closer,
larger or smaller than they actually are"** — used deliberately and disclosed.

---

## Fix 3 — Make the landmarks impossible to miss

Right now "2 billboards lit" and you cannot see either.

- **Screen-edge clamping.** Off-screen POIs pin to the frame edge with a direction arrow and
  distance — standard game HUD. The player always knows what is out there.
- **A bearing ribbon** across the top: a compass strip with ticks for each landmark, so free-look
  becomes purposeful. This is what makes "look left through the Hex" discoverable rather than
  a surprise.
- **Three-stage approach.** At 5 km a faint marker; at 2 km it brightens and gains a name; at
  500 m it blooms and becomes tappable. Anticipation is the feeling you are missing.
- **Vertical exaggeration for hero landmarks.** Zelda puts tall secondary landmarks above the
  terrain so they read from a distance. Do the same: render the Kimberley headgear, the Lord
  Milner, Table Mountain at 2–3× height with the scale disclosed.
- **Raise terrain exaggeration to 1.6–2.0.** The Highveld is flat; at 1.15 it reads as a plain.
  This one number changes the entire feel of the ride.

---

## Fix 4 — Real 3D objects, cheaply: billboard impostors

You asked how to build 3D objects from satellite and photographs. Do not model them. Games
solved this decades ago with **impostors** — a camera-facing textured quad that is
indistinguishable from geometry at distance.

**Pipeline, per landmark:**
1. Take the licensed Commons photograph you already ship.
2. Cut the subject out (headgear, hotel façade, church, windpump, mountain profile) to a
   transparent PNG, ~512 px.
3. Place it as a `symbol` layer at the presentation coordinate with
   `icon-pitch-alignment: 'viewport'`, `icon-allow-overlap: true`, and `icon-size` interpolated
   by zoom so it grows on approach.
4. Keep the photo credit on the impostor — same licence obligation as the photograph.

Eight to twelve impostors is a day's work and buys you a populated world. Add **generic set
dressing** the same way — windpumps, pylons, water tanks, sheep pens, farm sheds — scattered
along the corridor from OSM `man_made=windpump` and `power=tower`, which genuinely line that
route. Repetition is fine; it is the Karoo.

**Only three things deserve real geometry:** the train, the Big Hole (a torus depression in the
terrain), and the Matjiesfontein street. Use MapLibre's
[three.js on terrain](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/)
example verbatim, and take CC0 models from Poly Haven rather than modelling.

---

## Fix 5 — The animations: stop generating motifs, start moving the photograph

The scenes look generic because they are procedurally drawn vector shapes. The fix is the
technique used for every "living photo" you have seen: **2.5D parallax from a depth map.**

> The 2.5D parallax technique uses depth estimation to separate a flat image into layers and
> animate each at a different rate, simulating the parallax of a camera move from a single
> still frame.

**Pipeline, run once, offline:**
1. For each of the nine photographs, generate a depth map with **MiDaS** (free, runs locally in
   Python, no account). Output a greyscale `*-depth.webp` — they compress to ~30 KB.
2. Ship `photo.webp` + `photo-depth.webp`.
3. At runtime, a small WebGL shader displaces the photo by the depth map against a slowly
   moving virtual camera. Foreground drifts, background holds. The still image gains real
   volume.
4. Layer the existing interpretive motion *on top* at low opacity — the spiral over the Big
   Hole becomes a subtle accent on a photograph that is genuinely moving in depth, not the
   whole show.

If MiDaS is too much, the manual fallback still beats what exists: **three hand-cut layers**
(sky / mid / fore) per photo, animated at different rates in CSS. Pat David's tutorial is the
canonical free-software walkthrough.

**Per-hub camera moves** — each place gets its own move, not a shared preset:

| Hub | Move |
|---|---|
| Kimberley | Slow push *into* the crater, rim parallaxing outward |
| Matjiesfontein | Lateral dolly along the street, veranda posts sliding past |
| Beaufort West | Slow tilt up from scrub to koppie line |
| De Aar | Push along converging rails toward vanishing point |
| Worcester | Rise over the Hex escarpment |
| Cape Town | Pull back to reveal Table Mountain |
| Pretoria | Drift up through jacaranda canopy |
| Johannesburg | Slow rise past towers |

**Acceptance:** play any two scenes side by side. If you cannot tell which place each is
without reading the caption, it has failed.

---

## Honesty rules — non-negotiable, and they are an asset

Every compression gets a visible label:
- *"Landmarks shown at 3× scale and pulled toward the line for visibility."*
- *"Actual distance from the track: 8.2 km."*
- *"Terrain vertical exaggeration ×1.8."*
- *"Interpretive motion applied to a licensed photograph — not footage."*

Keep `hubs.json` coordinates true. Add a `presentation` block alongside, never overwriting the
measured value. Then the evidence console can show both, and **"we compress the view and tell
you we did"** becomes a slide rather than a liability.

---

## Order

1. **Fix 1** — ground treatment. One afternoon, removes the noise, everything else reads better.
2. **Fix 3** — terrain exaggeration to 1.8, three-stage approach markers, edge clamping.
3. **Fix 2** — variable pacing and lateral pull-in.
4. **Fix 5** — depth-map parallax on three hubs first (Kimberley, Matjiesfontein, Beaufort West).
5. **Fix 4** — impostors and set dressing.
6. Train model last; cut it if time runs short.

Per phase: gates, plus a screenshot. Required artefacts:
`evidence/legible-karoo-transit.png`, `evidence/legible-hub-approach.png`,
`evidence/parallax-kimberley.webm`.

**A transit frame where one smeared field dominates is a failed phase.**

---

## Sources

- [Inside Open-World Game Development](https://www.techtimes.com/articles/314497/20260206/inside-open-world-game-development-how-game-design-process-creates-immersive-maps-npc-systems.htm) — world compression, fidelity vs transit zones
- [Design Guidelines for Landmarks to Support Navigation in Virtual Environments](https://arxiv.org/pdf/cs/0304001) — landmarks at every navigable scale
- [Forced perspective](https://en.wikipedia.org/wiki/Forced_perspective)
- [Optical / Spatial / Dimensional Trickery in Games](https://alastaira.wordpress.com/2014/11/22/optical-spatial-dimensional-trickery-in-games/)
- [Turning Photos into 2.5D Parallax Animations with Machine Learning](https://waxy.org/2019/11/turning-photos-into-2-5d-parallax-animations-with-machine-learning/) — MiDaS depth pipeline
- [Pat David: 2.5D Parallax Animated Photo Tutorial](https://patdavid.net/2014/02/25d-parallax-animated-photo-tutorial/) — free-software manual method
- [3D Cinemagraphy from a Single Image](https://arxiv.org/pdf/2303.05724)
- [MapLibre — three.js models on terrain](https://maplibre.org/maplibre-gl-js/docs/examples/adding-3d-models-using-threejs-on-terrain/)
