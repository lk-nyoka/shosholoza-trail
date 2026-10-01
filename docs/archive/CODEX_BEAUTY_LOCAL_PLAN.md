# Part 2 — Make it beautiful, and unmistakably South African

Companion to `CODEX_LEGIBILITY_PLAN.md`. Part 1 makes the ride legible. This makes it good.

Right now it reads as a MapLibre demo: grey boxes, muddy satellite, generic editorial chrome.
Nothing on screen says Karoo, says railway, or says South Africa.

Two moves fix that: **stop drawing photographs of the ground and start drawing cartography**,
and **borrow a real local visual tradition instead of inventing one**.

---

## Fix 6 — Imhof relief: the biggest beauty upgrade available

Satellite at grazing angle will never look good. In transit zones, replace it with
**Swiss-style shaded relief with hypsometric tinting** — the Eduard Imhof tradition, the most
admired terrain rendering ever made, and the reason Swiss topographic sheets get framed.

The technique is an impressionistic palette of greens and ochres with an atmospheric
perspective shift to muted tones at lower elevations, combining hillshade with elevation
colour. You already load the Mapzen terrarium DEM. That is all you need.

```js
map.addLayer({
  id: 'relief', type: 'hillshade', source: 'elevation',
  paint: {
    'hillshade-exaggeration': 0.65,
    'hillshade-shadow-color': '#4a3b2a',      // warm shadow, never grey
    'hillshade-highlight-color': '#fff2d8',   // sunlit ochre
    'hillshade-accent-color': '#8a6f4e',
    'hillshade-illumination-direction': 315,  // drive from the real sun azimuth
  },
});
```

### The hypsometric ramp is where it stops being Swiss and becomes South African

Build the colour ramp from this corridor's real elevations, so colour alone tells a passenger
where in the country they are:

| Elevation | Where | Colour |
|---|---|---|
| 0–200 m | Cape lowlands, fynbos | `#6b7f5e` muted olive |
| 200–500 m | Breede valley, vineyards | `#8a9463` |
| 500–1 000 m | Great Karoo approach | `#b08a5c` ochre |
| 1 000–1 400 m | Karoo plateau | `#c08a5a` rust |
| 1 400–1 700 m | Highveld grassland | `#c9a86a` dry gold |
| 1 700 m+ | Escarpment, koppie tops | `#8c6b4a` deep umber |

**That ramp is the localisation.** Nobody else's map changes colour because it crossed onto the
Karoo plateau.

Implement as a `fill` with an `interpolate` on elevation, or pre-bake a tinted raster if the
DEM expressions are awkward in MapLibre 5.7.1.

**Atmospheric perspective:** distant terrain must desaturate toward the haze colour. This is
what makes Imhof feel like air rather than paint. `setSky`'s `fog-ground-blend` at ~0.25 in
transit zones gives it free.

Copy the exact values from John Nelson's Imhof how-to and Esri's "Steal this Imhof-Like
Topography Style" (links below). Do not re-derive them.

---

## Fix 7 — Steal a real local visual language: the SAR travel poster

South African Railways ran one of the great poster campaigns — the 1930s *"Travel in South
Africa, The Land of Sunshine"* series. Flat blocks of colour, romantic landscape, confident
heavy type, a tight palette, a strong horizon. Instantly and specifically South African,
period-correct for a railway product, and **nobody else in that room will use it.**

Apply to every non-map surface:

| Surface | Treatment |
|---|---|
| Arrival card at each hub | Poster composition: photograph, flat colour band, place name in heavy type, one line of copy |
| Collection strip | Enamel station-sign styling — cream on dark green, gold rule |
| Loading / offline screen | Full poster: silhouette landscape, `SHOSHOLOZATRAIL · PRETORIA–CAPE TOWN` |
| Chapter covers | One poster per hub, generated from its licensed photograph |
| Evidence console | Leave it plain and technical — the contrast is the point |

Palette, five colours only:
`#1e3d34` rail green · `#c9a227` brass gold · `#b4552d` Karoo rust · `#f0e6d2` bone ·
`#12181f` night.

Type: keep Fraunces for display but tighten it. The posters used heavy, wide-tracked capitals —
small caps and letter-spacing on place names will do more for local feel than a new typeface.

---

## Fix 8 — Set dressing that could only be this route

Generic boxes say nothing. A handful of specific silhouettes, repeated as impostors, will say
*Karoo* louder than any amount of satellite detail:

- **Southern Cross windpumps** — the most recognisable object in the South African interior.
  Real positions from OSM `man_made=windpump`; scatter more between them.
- **Telegraph poles along the line** — instant railway. One sprite, repeated every 60 m.
- **Flat-topped dolerite koppies** — already in the terrain; exaggerate the silhouette.
- **Aloe ferox** in the Karoo, **vineyard rows** in the Breede, **jacaranda canopy** at
  Pretoria, **Cape Dutch gables** at Worcester.
- **Sheep and springbok** as tiny distant sprites near Beaufort West.
- **Ndebele geometric banding** as the UI motif on the Pretoria chapter — Esther Mahlangu made
  that language internationally famous and it belongs to the start of this line.

Twelve 256 px transparent PNGs is an afternoon and it transforms the world.

---

## Fix 9 — Sound: use Shosholoza itself

A 27-hour journey that makes no noise is the biggest missed opportunity in the build, and the
answer is in the project's own name. **Shosholoza** is the migrant workers' song about this
exact thing: the train carrying labourers to the mines.

- **Rail rhythm** — a low percussive pulse locked to travel speed, built on the song's
  call-and-response cadence. Accelerates at 4× and 16×.
- **Regional ambience** — Highveld hum, Karoo wind and cicadas, night crickets, Cape gulls.
- **Discovery chime** — one warm note when a place lights. Never a game jingle.
- **Silence in the waiting state.** When the train stops, the rhythm stops. That absence is the
  most powerful sound design in the product.

**Rights:** the traditional melody is old but *recordings* are copyrighted. Do not lift one.
Record a simple original percussion motif or use CC0 ambience from Freesound, and log it in the
source register like every other asset.

---

## Fix 10 — Light, motion, polish

The gap between "tech demo" and "product" is almost never detail. It is light and easing.

- Drive hillshade illumination from the **real sun azimuth**, not a fixed 315°.
- **Default the demo to golden hour.** Everything looks better at 17:00; the Karoo especially.
- A **whisper of film grain** over the canvas. Digital renders look cheap because they are too clean.
- **Ease everything, snap nothing.** Camera moves settle, cards rise, the strip blooms.
- A slight **vignette** — focuses the eye and hides the worst of the foreground stretch.

---

## Combined order for Part 1 + Part 2

1. **Fix 6** — Imhof relief and the South African ramp. *Start here:* it solves the noise
   problem and the ugliness problem in one pass.
2. **Fix 1** — satellite only near hubs, cross-fading into the relief.
3. **Fix 3** — terrain exaggeration 1.8, approach markers, edge clamping.
4. **Fix 10** — sun-driven light, golden hour, grain, easing.
5. **Fix 7** — SAR poster chrome on arrival cards and collection strip.
6. **Fix 8** — windpumps, telegraph poles, koppie silhouettes.
7. **Fix 5** — depth-map parallax on Kimberley, Matjiesfontein, Beaufort West.
8. **Fix 9** — audio.
9. **Fix 2 / 4** — pacing, lateral pull-in, remaining impostors.

**Acceptance:** show a Karoo transit frame to someone who has never seen the project. If they
cannot tell it is a designed product rather than a map-library demo, it failed. If it could be
anywhere in the world, the localisation failed.

---

## Study before building

- [John Nelson — Imhof-style how-to](https://adventuresinmapping.com/2020/02/28/condensed-how-to-updated-imhof-style-map-of-switzerland/) — exact colours and layer order
- [Esri — Steal this Imhof-Like Topography Style](https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/steal-this-imhof-like-topography-style-please)
- [Swiss-style relief shading methodology (ICA)](https://icaci.org/files/documents/ICC_proceedings/ICC2009/html/nonref/25_4.pdf)
- [Terrain cartography / hillshade](https://en.wikipedia.org/wiki/Hillshade)
- [MapLibre — hypsometric tint discussion](https://github.com/maplibre/maplibre-style-spec/issues/1067)
