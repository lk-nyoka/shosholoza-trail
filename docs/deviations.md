# Reference adaptations

## EarthDrive follow camera

Reference: `../Repos/earth-drive-main/src/main.js`, MIT.

Expected behaviour: manual vehicle orbit, no return while dragging, 1.5-second
delay after interaction, shortest-angle return with .08 per-frame damping.

Change made: MapLibre geographic centre/bearing/pitch/zoom replace the reference
Three.js/Cesium spherical camera. A 100 m trailing centre and 80 m route look-ahead
frame the train at zoom 17.7. Damping is elapsed-time adjusted, and geographic
centre uses that damping too. Existing ride input sensitivities are retained.

Reason: the application already renders with MapLibre, and the reference frames
a car rather than an articulated train. The plan requires detached positional
lag and consistent timing across devices.

Visual consequence: recognisable delayed orbit return and smooth trailing
behaviour; train framing, projection and translational lag differ from the
reference. No claim of exact visual equivalence. Full source values, exclusions
and coordinate details are in `camera-reference.md`.

## Freedom Park landmark geometry

Reference: none. No 3D asset, photogrammetry, Gaussian splat or camera path for
Freedom Park exists anywhere in the workspace. Confirmed by a sweep for
`.glb .gltf .ply .splat .sog .spz` and camera/keyframe JSON across the whole
repository and every reference project in `Repos/`.

Expected behaviour: per the plan, a landmark should be the supplied 3D
representation, shown by a supplied camera trajectory.

Change made: `app/src/animation/landmarks/FreedomPark.ts` builds an
interpretation from primitives — the Salvokop rise, the curved wall of
Sikhumbuto, the reed field, the Isivivane boulder circle and the flame. The
camera move in `data/landmarks/freedom-park.json` is newly authored.

Reason: the user was asked and chose an approximation over an empty landmark
slot. Nothing is claimed to be surveyed. The scene builder, the geometry and the
camera path are all replaceable without touching the engine: a real asset needs
a new builder registered in `LANDMARK_BUILDERS` and a new `cameraAnimation`
block, nothing more.

Visual consequence: the silhouette reads as a hilltop memorial from the rail
corridor, which is how Freedom Park is actually seen from the line. It is not a
likeness. Every surface that shows it — the tourism card, the page caption and
the file header — says "approximate geometry, newly authored camera move".

## Cinematic keyframe orientation

Reference: the plan's generic camera-animation format, section 11, which carries
`quaternion` on every keyframe.

Change made: `CinematicCamera` accepts either `quaternion` or `target` on a
keyframe. A keyframe carrying `quaternion` is used verbatim and never
re-derived; only a keyframe that omits it has orientation computed from a
look-at point.

Reason: hand-authoring quaternions is unreadable and unreviewable, and every
keyframe in the repository today is hand-authored. A real exported path that
carries quaternions keeps its exact orientation, which is the property the plan
is protecting.

Visual consequence: none for supplied animation. Hand-authored moves are
readable in the JSON and can be edited without a tool.

## Procedural window texture

Reference: `../Repos/threex.proceduralcity-master/threex.proceduralcity.js`,
MIT, Jerome Etienne after mrdoob — `generateTextureCanvas()`, lines 74-106.

Expected behaviour: paint rows of 2×1 window rectangles at random brightness on
a 32×64 canvas, then draw that canvas into a 512×1024 one with
`imageSmoothingEnabled = false` so the windows upscale crisply instead of
blurring.

Change made: the algorithm is preserved exactly, including both canvas sizes,
the 2-pixel row and column stride and the smoothing flag. Two things differ.
The reference paints white with dark windows and uses the result as a diffuse
`map`; ours paints black with lit windows and uses it as an `emissiveMap`, so
the texture is invisible by day and lights the buildings from within at night.
And the lit/dark split is weighted — roughly 38% of windows lit — rather than a
uniform random brightness.

Reason: the reference lights a city that is always night. Ours has four times of
day, and a diffuse window map would show as grubby stippling at midday. The
reference's own code cannot be used directly in any case: it depends on
`THREE.Geometry`, `CubeGeometry`, `faceVertexUvs` and `GeometryUtils.merge`, all
removed from three.js in r125.

Visual consequence: at night the buildings carry scattered lit windows at
roughly storey spacing. By day they are plain walls, as the reference's never
are. Window spacing comes from ExtrudeGeometry's side-wall UVs, which are in
metres, so it is consistent across buildings of different sizes but is not tied
to actual floor heights.

## Wheels rehomed out of the vehicle shell

Reference: none; this is a constraint of the supplied CC0 Quaternius models.

Expected behaviour: rotate the GLB's own wheel nodes.

Change made: the wheel nodes are hidden and their along-body offsets recorded,
and every wheel on the train is drawn by one InstancedMesh in world space at
uniform scale.

Reason: each vehicle's GLB is fitted to real dimensions by a shell with scale
(1.27, 3.2, 1.5), because the low-poly source is not proportioned like a
Cape-gauge coach. Rotating a child inside a non-uniform parent scale shears it —
the wheels would turn as wobbling ellipses.

Visual consequence: the wheels are our cylinders at 900 mm diameter on 1 067 mm
gauge, not the model's own wheels. They are rounder and more regular than the
low-poly originals. Roll is tied to distance travelled, so scrubbing the
timeline backwards rolls them backwards.

## The railway is graded, the ground is not

Reference: none supplied; this is how railways are actually built.

Change made: the terrain mesh follows the baked heightfield sample for sample,
but the track does not. `Terrain.grade()` runs a moving average over the
along-route elevation samples and the rail follows that smoothed profile. The
gap between the two is filled by `buildFormation()`, which draws a ribbon from
rail level down to the ground either side — embankment where the land falls
away, cutting where it rises.

Reason: a line draped over every undulation is the most obvious tell that a
railway scene was made by someone who has not looked at one. Real formations are
graded to a gentle, continuous gradient; the earthworks absorb the difference.
Over this slice the ground moves through 251 m while the route climbs 96.6 m.

Visual consequence: the track runs level and straight-gradiented while the veld
rolls underneath it, and the formation is visible as a pale ribbon. The batter
angle is a flat 1.5:1 everywhere rather than varying with soil, and there are no
retaining structures, culverts or bridges — where the real line would bridge,
this simply builds a taller embankment.

## Level crossings are found, not authored

Reference: none.

Change made: `findCrossings()` tests every OSM road segment against the rail
centreline and builds a crossing wherever they actually intersect. Four are
found in this slice. Crossings within 30 m of each other are treated as one.

Reason: placing crossings by hand would put them where they look good rather
than where roads meet the line, and the two datasets are already in the scene.

Visual consequence: the crossings are where OSM says the roads are. The model —
St Andrew's cross, twin flashing reds — is right for South Africa, but booms are
declared and not yet animated, and no crossing is grade-separated. Where the
real line passes under a road bridge, this builds a level crossing instead.

## The joint rhythm is jointed-rail, the line is welded

Reference: none.

Change made: `TrainSound` schedules a "da-dum" of wheel-on-joint clicks every
18.3 m of travel — classic 60 ft jointed rail, with the second click delayed by
the bogie wheelbase over the current speed.

Reason: the Pretoria–Cape Town main line is largely continuously welded, so real
joints are far rarer than this. The rhythm is nonetheless what a train is
expected to sound like, and it is the only cue in the soundscape that conveys
speed directly rather than through pitch. Kept, quietly.

Visual consequence: none. Audible consequence: a steady rhythm that speeds up
and slows with the train and stops when it does. A recording of the real line
would have long silent stretches between welds.

## Fountains Valley landmark geometry

Reference: none. No 3D asset, survey or camera path for Fountains Valley exists
in the workspace.

Change made: `app/src/animation/landmarks/FountainsValley.ts` builds an
interpretation from primitives — a green valley floor between low ridges, a
spring-fed pond ringed with stones, a meandering stream and 84 shade trees in
nine clumps. The 12-second camera glide in `data/landmarks/fountains-valley.json`
is newly authored.

Reason: same decision as Freedom Park — an openly labelled approximation rather
than an empty landmark slot. The location, route position and offset come from
OpenStreetMap; the shape of the valley does not.

Visual consequence: reads as a park in a valley from the corridor. It is not a
likeness; the pond's size, the stream's course and the tree placement are
invented to read well, not measured. The tourism text claims only that this is
where the Apies River rises and that its springs once supplied Pretoria's water.

## Suburban halts

Reference: OpenStreetMap records Fonteine and Kloofsig as stations on this line.

Change made: `Halts.ts` gives both the same generic layout — a 120 m curved side
platform, a 12 m shelter, three benches, five lamps and two name boards.

Visual consequence: the stations are where OSM puts them and carry their real
names, but the platforms are not surveyed. Real lengths, island platforms,
footbridges and ramps are not modelled, and both halts look alike.

## Hadedas

Reference: none; this is authored localisation.

Change made: `Birds.ts` flies small flocks at 40–120 m over the corridor, and
`TrainSound` synthesises the hadeda's falling "haa-haa-haa" call every 14–36 s
when the train is slow enough for it to be heard.

Reason: hadedas are the bird of Pretoria's sky and the sound of its mornings.
Generic birdsong would place the scene nowhere in particular.

Visual consequence: the birds are drawn at 1.6× life size — a real hadeda spans
about 1.1 m, which is a speck at the altitudes they fly — so they read as birds
rather than noise. The call is synthesised, not recorded: it has the right
shape (harsh, falling, repeated) but not the real timbre.

## Voortrekker Monument

Reference: OpenStreetMap way 239878491 (`historic=monument`) for its position.
No 3D asset, survey or camera path exists.

Change made: `landmarks/VoortrekkerMonument.ts` builds the recognisable massing
from primitives — a pale granite block about 38 m square rising to 45.8 m with a
stepped arched crown and an arched window on each face, a figure on a plinth at
each corner of a stepped terrace, and a ring wall of 58 instanced wagon
segments. A gateway gap and a paved avenue are the builder's own additions. The
9.5 s camera move is newly authored.

Reason: it is Pretoria's most recognisable skyline landmark, about 1.7 km from
the line at 2.4 km along. From that distance silhouette matters far more than
detail, which is what primitives can give honestly.

Visual consequence: it reads as the monument from a distance and in the
cinematic. It is not a likeness: proportions are rounded, not measured, and the
corner figures are silhouettes. The tourism text is deliberately neutral and
limited to well-established facts — a granite monument completed in 1949,
commemorating the Voortrekkers who left the Cape Colony in the 1830s and 1840s.

Timing: its trigger (1 850 m) and release (2 450 m) are placed so the
approach, cinematic and return finish before Fountains Valley triggers at
2 520 m. The director ignores a trigger crossed while another cinematic plays,
so overlapping windows would silently skip the second landmark.

## Terrain levelled under landmarks and the station

Reference: none; standard game practice.

Change made: `Terrain.addStamp()` levels a circular pad under each landmark's
`footprint` and under Pretoria station, blending back to the real ground over a
band. It rewrites the height grid itself, so the terrain mesh and `groundAt()`
always agree.

Reason: landmarks are authored on a flat floor, and the real ground under them
varied by tens of metres — Fountains Valley was buried up to 11 m on one side
and floating on the other. The station was built at rail level while the ground
beside the line stood higher.

Visual consequence: the real hilltops under Freedom Park and the Voortrekker
Monument are levelled within their inner radius and replaced by the authored
ground. The blend band at 60 m grid resolution is coarse, so the transition is a
smooth rise rather than a crisp edge.

## Waiting passengers

Reference: Sketchbook's `boxman.glb` (MIT, swift502), reused unmodified.

Change made: 14 people stand on the Pretoria platform playing the model's own
`idle` clip, a few turning occasionally, each recoloured.

Reason / consequence: they are mannequins, deliberately stylised, not people.
Standing only — the model's `sitting` clip is a car-seat pose that would leave
feet hanging 22 cm above the platform on these benches. The model's single
material includes a face texture carrying a small "three.js" label; it is tinted
with the clothing and is not legible at platform distance.

## Street-light pools

Change made: each of the 900 street lights drops an additive radial glow decal
on the road, driven by time of day.

Reason / consequence: no real lights are used — at this count they would be
unaffordable — so nothing is actually illuminated. The pools are flat on the
ground at each post's height, so on a steep slope part of a pool can sit a
little above or below the road.
