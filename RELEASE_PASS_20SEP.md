# Release pass — 20 September 2026

This pass followed the 19 September audit. It kept every fix that audit made
and worked from a clean install, a real browser and measured numbers rather
than from reading the code.

How things were verified is stated with each item. Where something could not be
tested in this environment it says so, rather than being claimed.

## The largest change: Cesium removed

`/terrain` rendered a CesiumJS globe. Three things were true about it at once:

1. It could not work. `Cesium.Ion.defaultAccessToken` is never set anywhere in
   the repository, and both `Terrain.fromWorldTerrain()` and
   `createOsmBuildingsAsync()` require a Cesium ion token. Every visit would
   have failed on a 401.
2. It was sample code. The "Distance styling" option coloured buildings by
   distance from latitude 47.62051, longitude −122.34931 — Seattle, Washington,
   left in from the Cesium sandcastle demo it was copied from.
3. It was the most expensive thing in the build, by a wide margin.

It was also unreachable: no link in the navigation or the footer pointed at it.

Measured before and after a clean `npm run build`:

| | Before | After |
| --- | ---: | ---: |
| `dist/` on disk | 17 MB | 2.7 MB |
| Service-worker precache | 330 entries, 10 109 KiB | 29 entries, 2 106 KiB |
| Main CSS bundle | 114.6 KiB (26.5 KiB gzip) | 74.6 KiB (14.9 KiB gzip) |

301 of those 330 precache entries were Cesium. A first-time visitor on the
public deployment downloads the precache before the app is usable offline, so
this was roughly 8 MB of mobile data spent on a page that could not load, on a
product whose whole argument is that it works on a Karoo mobile bundle.

Confirmed still live on the public URL at the time of writing:
`GET https://storied-cendol-2fcdaf.netlify.app/cesium/Cesium.js → 200`, on the
home page.

Removed with it: `cesium`, `vite-plugin-cesium` and `3d-tiles-renderer` from
`package.json`, and `src/lib/photoTiles.ts` and `src/lib/_googleTiles.ts.bak` —
the only two files that still named `VITE_GOOGLE_MAPS_KEY` and
`VITE_CESIUM_ION_TOKEN`, neither of which is used by anything.

`leaflet`, `react-leaflet` and `motion` were also removed: nothing imported
them. `src/main.tsx` was still importing `leaflet/dist/leaflet.css`, which is
where 40 KiB of the CSS bundle went.

The Ride's Three.js rail world is untouched. It was always the better of the
two 3D implementations and it needs no paid token.

## The route guide no longer answers safety questions with tourism

`src/lib/aiEngine.ts` is TF-IDF retrieval over a fixed corpus. TF-IDF always
has a best match, and the answer floor was `0.005` — low enough that a single
shared word counted as an answer. Asked **"Is the train safe at night?"** it
returned the De Aar Railway Heritage Walk, because both mention night. Asked
whether a train was delayed, it returned Karoo fossil beds.

Two changes:

- **A guard ahead of retrieval** for safety, live running/delays/platforms,
  emergencies and ticket sales. Each answers honestly about what the app does
  not know and points at who does. The emergency reply gives 10111.
- **A measured answer floor.** Questions the corpus covers score 0.31 and
  above; questions it does not top out at 0.25. The floor is 0.28. Multi-word
  tag matches now outweigh single-word ones, because a corpus author writing
  `"where am i"` meant it and one shared noun is usually coincidence.

Three documents were added, for questions the guide simply could not answer:
what Shosholoza Trail is, what the journey modes do, and that it does not know
where the train is.

One regression was caught by testing the page's own suggested questions: a
`/book/` pattern in the ticket guard swallowed **"Can I book a room at Lord
Milner Hotel?"**, which is printed on the page as a suggestion. The guard now
requires rail context and stands aside for rooms, tables and places to stay.

26 assertions cover this in `src/lib/__tests__/guide.test.ts`.

## The Ride, measured at 390 px

The Ride was rebuilt at some point around the animation — "one bar at the top,
one at the bottom" is in the stylesheet — but `Layout` kept rendering the site
header underneath it. Measured at 390 px: the site header occupied y 0–72, and
the Ride's own bar y 12–131, drawn straight over it.

- The header no longer renders on `/ride`. The Ride's bar carries a home
  control so the immersive screen is not a dead end. `/journey` and `/app` are
  full-bleed but have no competing bar, so they keep the header.
- The bar was 183 px wide inside a 390 px screen, because `left: 50%` with no
  `right` makes an absolutely positioned box shrink to half the viewport. The
  three mode buttons wrapped into a column and the bar grew to 119 px tall. It
  is now one 46 px row at every width tested.
- The data meter — "Full detail · 3.6 MB", the low-data toggle — was clipped
  off the end of the bar, underneath the cinematic-view button.
- The playback buttons are 32 px squares and "−50km" is wider than 32 px, so
  the labels spilled and "+50km" landed on top of the speed selector. Measured
  after: no overlapping pairs.
- The line that says the view is *"interactive rail-world simulation on mapped
  geometry and imagery, not footage"* was 9–10 px at about a third of white
  over sunlit terrain. A claim worth making is worth being able to read.

**A control that lied.** `← Route overview` in the Ride bar ran
`setIsPlaying(false)` and nothing else — a second pause button, wearing the
name of a different page (`/journey`, which the footer calls "Route overview"),
700 px above the real pause button. It now opens the route overview.

## Touch targets

Measured at 320 px, then fixed, then measured again. WCAG 2.5.8 asks for 24 px.

| Control | Was | Now |
| --- | ---: | ---: |
| Footer links (13, every page) | 19 px tall | 24 px |
| Stop-hub actions ("Read stories", "Start on the ride", …) | 19 px | 24 px |
| Photo carousel dots | 7 × 7 px | 7 px painted, 24 px target |
| Experience-card close | 10 × 19 px | 24 px target |
| Journey scrubber (`input[type=range]`) | 5 px tall | 28 px, 5 px track |
| Destinations search field | 16 px tall, 13 px text | 40 px, 16 px text |
| Ride "look down" | 19 × 19 px | 36 × 36 px |

The dots and the close button keep their painted size and grow an invisible
`::after`, so nothing moved. The search field's 13 px text was also the size at
which iOS Safari zooms the page on focus.

Final sweep: 17 routes × 320, 360, 390, 430, 768, 1024, 1366, 1920 and
844 × 390 landscape. No horizontal overflow and no target under 24 px at any of
them.

## Smaller fixes

- **Headings ran together for screen readers.** `The country goes<br/>past` has
  no space between the text nodes, so the accessible name was "The country
  goespastat window height." Eight headings across Home, Stories, the guide,
  Plan, Help, Privacy, Credits and the song lyric.
- **Every page had the same `<title>`.** Only the 404 renamed itself, so eight
  open tabs were indistinguishable and sharing the Kimberley stop hub looked
  identical to sharing the privacy page. Titles are now set per route, with
  stop names derived from the URL.
- **Heading levels skipped.** `PlaceCard` used `<h4>` under an `<h2>` on
  `/destinations` and `/app`; the experience card used `<h3>` directly under
  the Ride's `<h1>`.
- **`/api/*` was called on a build with no API.** `VITE_API_BASE_URL` defaults
  to `/api/v1`, Netlify answers that with a deliberate 503, and every page
  opened with a row of red failures in the console for requests already known
  to fail. The client now refuses before the request; the timetable hook says
  so plainly. Verified: no `/api` request on `/app` after the change.
- **"My Journey" bounced you out after 1.4 seconds.** Arriving without a trip
  showed a helpful explanation and then redirected before most people finish
  reading it. The explanation and its button stay; the timer is gone.
- **The privacy notice did not mention the one form that uploads a contact
  detail.** The "want this on your next trip" sign-up sends an email or phone
  number when a sync service is configured. It is honest on the form itself;
  it is now in the notice too.
- **Documentation described a Leaflet map.** The app has not used Leaflet for a
  long time; `PROJECT_HANDOVER.md` said it did, in three places.

## Verified

Commands and results, run on a clean `npm install`:

- `npx tsc -b` — **pass**, no errors.
- `npm run build` — **pass**. 29 precache entries, 2 106 KiB.
- `npm test` — **pass**, three suites: corridor (10), storage and modes (19),
  route guide (26).
- `python -m pytest` in `backend/` on a clean venv — **15 passed**, matching
  the 19 September baseline.
- 17 routes rendered and probed at nine viewports plus landscape.
- Public deployment opened and checked: `/api/v1/timetable` returns a 503 with
  an honest JSON body, the deep link `/stops/kimberley` returns 200 HTML, and
  the service worker is active with nothing waiting.

## Not verified here

- **Service-worker behaviour on the rebuilt bundle.** The local preview server
  is plain HTTP and the browser refused to register the worker against it. The
  worker is verified active on the existing public deployment; the new one has
  not been deployed. **NOT VERIFIED — tooling/environment limitation.**
- **WebGL frame rate on a low-end phone.** The scene was rendered and driven in
  a desktop browser at emulated phone sizes, which is not the same as a
  mid-range Android. **NOT VERIFIED — tooling/environment limitation.**
- **The rebuilt bundle on the public URL.** Everything above was measured on a
  local build of this source. The public deployment still serves the previous
  build, including Cesium. **Deploying it is a separate decision.**

## Found later the same day, while capturing screenshots for the team

Three of these were invisible to the automated checks and only showed up in a
rendered picture. That is the argument for looking at the thing.

- **The ± 50 km buttons drew their icon and their label on top of each other.**
  A 38 px square with `place-items: center` puts both children in the same
  cell, and "-50km" is wider than 38 px, so at desktop width the labels spilled
  across their neighbours and "+50km" landed on the speed selector. Both
  buttons already carry an icon, a title and an aria-label, so the label is
  what goes.
- **The landmark callout spent its first half-second off the side of the
  screen.** Its entrance animation starts at `translateX(24px)`, it is anchored
  to the right edge, and it re-keys on every new landmark — which at 8× demo
  speed is constantly. At 390 px it was clipped there, over and over, through
  the whole demo. It rises now instead of sliding in, which cannot push
  anything sideways.
- **The guide and the app disagreed about every stop distance**, by about 12 km
  at each town and 31 km at Worcester. The app derives distance from the
  snapped OSM rail geometry; the corpus had been written from a different
  table. Ask the guide how far Kimberley is and it said 552 km; the stop page
  said 540 km. The corpus now quotes what the app computes.

A note on the automated overflow check: `html, body { overflow-x: clip }` keeps
`document.scrollWidth` equal to the viewport width even when a child is drawn
past the edge, so a scrollWidth comparison cannot see this class of bug.
Measuring each element's own rectangle against the viewport can, and does.
