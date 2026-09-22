# Shosholoza Trail — TRL 5 implementation log

Running record of the master-prompt work, newest at the bottom. Every entry
states what changed, why, and how it was verified.

Verification means these three commands run in the working folder on the team's
own Windows machine, not only in a Linux container:

```
npx tsc -b        # no type errors
npm test          # every suite green
npx vite build    # production bundle succeeds
```

---

## Sync — the working folder becomes the source of truth

The corrected tree had been living in a zip. It is now the folder at
`GKHack26\ShosholozaTrail-Frontend`, with the files the fixes deleted removed
and dependencies reinstalled (74 packages dropped: Cesium, Leaflet, motion,
3d-tiles-renderer). A backup was taken first to
`Downloads\st-folder-backup-20260922-0617`.

**Verified:** tsc clean · all suites green · build 2.57 MB.

## P0-1 — One authoritative source for route and timetable facts

**Problem.** Route facts were typed into whichever page needed them and had
drifted: 27 hours on one page against 28h 10m on another, Cape Town at 1 582 km
in one dataset against 1 568.4 measured from the mapped geometry, and a third
set of station distances in the route guide about 12 km out at every town.

**Fix.** `src/lib/corridor.ts` owns every railway fact — distance, duration,
station order, scheduled times, day numbers, stop duration, operator name,
timezone, timetable source, demonstration notice. Distances derive from the
mapped geometry, times from the published timetable. Every consumer imports
from it. The `1582` placeholders were cleared, Help derives its duration, and
*"Demonstration timetable — confirm with the operator before travel."* appears
above the timetable and in trip setup.

**Tests.** `corridor-facts.test.ts`, 28 assertions.

**Also fixed.** The test runner called `npx` directly, which cannot work on
Windows, so the team saw every suite fail for a reason unrelated to the code.

## Shosholoza: Then and Now

Two recordings as two perspectives at `/shosholoza`, plus four moments along the
line: the song opens the journey at Pretoria, is examined in a comparison
exercise after the diamond fields, answered creatively in the Karoo, and returns
near Cape Town.

Official embeds only, on the passenger's tap; the iframe is not on the page
until then. No autoplay, no download, not in the offline package, never
presented as ours, no lyrics or translation reproduced. No credit invented —
every field reads "Not yet verified" with a link to the video page.

**Tests.** `shosholoza.test.ts`, 48 assertions.

**Outstanding, person-only:** verify both sets of credits; language and cultural
sign-off. Checklist in `SHOSHOLOZA_THEN_AND_NOW.md`.

## P0-2 and P0-3 — Boarding-station time synchronisation, day and midnight

`src/lib/journeyClock.ts` makes the passenger's itinerary the ride's temporal
source of truth. Pretoria boarding begins at 08:30; Kimberley boarding begins at
Kimberley at 19:07 with travelled distance zero and the Pretoria section left on
the map as context. Time is an instant, never an hour, so midnight is a
non-event. Africa/Johannesburg always — only UTC methods are used, so a laptop
set to New York gives identical results. Clock and kilometres interpolate
together. Northbound is mirrored from the published table and labelled as not
the operator's. Delays change the wording to "Estimated arrival".

**Tests.** `journeyClock.test.ts`, 118 assertions — leap day, month end, year
end, intermediate legs, boarding on the service's second day, station arrivals
on published times, round trips, monotonic time across midnight, clamping, and
four impossible itineraries refused.

**Verified:** tsc clean · 252 assertions across six suites · build 2.59 MB.
</content>
</invoke>

## P0-4 — The sun, the sky and the night

**Problem.** The ride was lit by one fixed light, all day, every day. The
service leaves Pretoria at 08:30 and reaches Cape Town at 12:40 the next day,
so a passenger spends a whole night in that light — and the Karoo, the darkest
sky on the route and the part of the journey people describe first, looked like
midday.

**Fix.** `src/lib/sunSky.ts` computes where the sun actually is, from the
passenger's own instant and the train's own latitude and longitude, using the
NOAA solar-position algorithm written out rather than added as a dependency —
sixty lines of arithmetic with no data file, which is what an app that has to
work offline in the Karoo can afford.

From that elevation it derives eleven continuous phases — night, astronomical,
nautical and civil twilight, sunrise, morning, midday, afternoon, golden hour,
sunset, dusk — on the standard twilight boundaries, not invented ones. Every
colour, intensity, fog distance, exposure and sky uniform interpolates on the
elevation, so crossing a boundary changes the phase's *name* and nothing you
can see.

Sky glow is modelled for seven places on the line: Johannesburg and Cape Town
wash their sky out completely, De Aar and Beaufort West barely, and the veld
between them is a true dark sky with the stars to match. A warm carriage lamp
comes up as the sun goes down, so a night frame reads as a moving train rather
than a still.

When the calculation cannot be trusted — a bad date, a bad position, anything
thrown — the scene falls back to deterministic mid-morning light and *says* so,
rather than quietly leaving a rider in the dark.

**Also.** `useReducedMotion` — a rider who has asked their device for less
motion gets the lighting swing capped as well as the camera held steadier.

**Tests.** `sunSky.test.ts`, 132 assertions. The astronomy is checked against
published figures, not against itself: Cape Town's noon sun reaches 79.5° at
the December solstice and 32.6° at the June one, and the code gives 79.52° and
32.67°. Solar noon lands at 12:44 SAST at Cape Town and 12:07 at Pretoria,
which is what 18.42°E and 28.19°E against a 30°E clock require. The lighting is
checked for the properties a rider would notice: monotonic through the day, no
colour seam at any of the six phase boundaries, never fully black, never
brighter at midnight than at noon, and recoverable from every bad input.

**Verified:** tsc clean · 384 assertions across seven suites · build 2.59 MB.

## P0-5 — The ride on a phone

**Problem.** At 390 px the ride was drawing fourteen absolutely-positioned
regions over the animation at once — two bars, a bearing strip, a landmark
list, a POI callout, look controls, a trip chip, a HUD, a route caption, a
station rail, a mode switch, an experience card and a context panel. Each was
defensible alone; together they left the view — which is the product — visible
through the gaps.

Three defects were found only by looking at the rendered screen, not by
reading the code:

- The context panel has always been hidden unless it carried a `--open` class,
  and nothing ever added that class. The station context, the "passing now"
  note and "Ask the trail" were unreachable at every screen size.
- The top bar ran 460 px past the right edge of a 390 px phone, cutting the
  journey readout in half — the single most useful line on the screen.
- Three rules lost to the global `.ride-page button` minimum on specificity
  and silently did nothing, so a chip that was meant to be hidden shipped
  visible through two builds.

**Fix.** One screen, three named states rather than a boolean and a hide
switch: `cinematic` (the view and the way back), `explore` (the view with its
captions), `control` (stops, playback, station detail). The switch is a radio
group — exactly one state is on, which is what a radio group means and what
`aria-pressed` on three buttons does not — and it is visible in every state,
because a state you cannot leave is a trap.

On a phone the context panel becomes a bottom sheet: a peek showing the
journey readout, raised to what is left of the screen when the rider asks for
it. How tall "what is left" is was measured rather than guessed — 58% of a
390x844 viewport, 40% of a 320x568 one.

**Also.** 44x44 touch targets across the app's chrome, not the WCAG floor of
24: this is a one-handed app on a moving platform. Body-copy links keep their
line height, since the sentence is the target. Safe-area insets on every edge.
The 50 km jumps stand down below 380 px, where nine controls at 44 px needed
432 px of width in 296.

**Tests.** `scripts/check-layout.mjs` — 105 measurements across five viewports
from 320 px to 1280 px, in all three ride states. It opens the built app in a
real browser and reads the live layout: every target's size including any
hit area a pseudo-element adds, every chrome region against every other, and
every element's edges against the viewport.

That last one matters. The first version used `document.scrollWidth`, and this
app sets `html, body { overflow-x: clip }` deliberately — `clip` removes the
overflow from the scroll box, so a bar hanging 460 px off the side reports a
scrollWidth exactly equal to the viewport. The check passed a screen that was
visibly cut in half. It measures element edges now.

**Verified:** tsc clean · 384 assertions across seven suites · 105 layout
measurements clean · build 2.59 MB.

## P0-6 — Getting a new build onto a passenger's phone

**Problem.** The app was configured `registerType: "prompt"` — the new worker
waits until the passenger says so, which is the right call for somebody
mid-page on a train. The component that was meant to ask them could not find
the update in the first place, on the journey this app is for:

- It looked once, when it mounted. A service worker checks for a new script on
  navigation, and a passenger who opens the app at Pretoria and closes it at
  Cape Town does not navigate for twenty-eight hours. A build shipped during
  the journey was never seen at all.
- It used `getRegistration()`, which resolves `undefined` if the worker has not
  registered yet. On a cold first load that is a race it loses — and then there
  is no listener for the rest of the visit.
- Its reload waited on `controllerchange` with nothing behind it. When that
  event never arrives — and it does not, if the waiting worker was already
  activated in another tab — the passenger's tap did nothing, which reads as a
  broken button.

There was also no data versioning at all: a build that changed a stored shape
would have been read by an older parser, and there was no way to clear a
corrupt download short of clearing the whole site.

**Fix.** `src/lib/appUpdate.ts` — a state machine over a small injected slice
of the service-worker API, so all of it is testable without a browser. It
detects a worker that was already waiting, polls hourly, re-checks when the
tab comes back and when the signal returns (on this route, that last one is
the common case), and applies the update on `controllerchange` *or* after a
three-second timeout, once. A reload that does not happen is worse than one
without the handshake.

Offline data is versioned. A migration preserves the passenger's own content —
their trip, their stamps, what they wrote, anything not yet sent — and drops
what is derived and re-fetchable. An unknown `st.` key is kept rather than
guessed at. "Reset offline data" on the Help page clears the download and says,
in the sentence above the button and again in the confirmation, exactly what
stays.

The Help page now shows the build ID and the offline data version, because the
first question when something is reported is always which version it happened
on.

**Tests.** `appUpdate.test.ts`, 75 assertions — including the worker waiting
before load, the 28-hour session, three taps producing one reload, a handover
that never comes, a check that throws because the train is in the Karoo, a
cache that refuses to be deleted, and both directions of the migration: what
must survive and what must go.

**Verified:** tsc clean · 459 assertions across eight suites · 105 layout
measurements clean · build 2.59 MB.

## P0-7 — What the rider looks at while the world builds

**Problem.** Opening the ride showed a black rectangle for several seconds
while the elevation model was fetched and the corridor built. On a phone that
reads as a crash, and when the build actually failed — an unreachable tile
server, which is the common case on this route — it stayed black for ever with
nothing to do about it.

**Fix.** A branded frame over the world, saying what is actually happening.
Not a progress bar: the app does not know how long the elevation tiles will
take on a train, and a bar that guesses is a lie. Four stages, each reported
when that piece of work really starts — *Preparing the corridor*, *Reading the
ground*, *Laying the track*, *Bringing in the landscape* — so a rider watching
"Reading the ground" sit there for ten seconds has learned something true
about their signal.

The frame comes off as soon as the rails are down, not when the imagery
finishes: grey ground you can already move over beats a spinner over nothing.

Two ways out on failure, because there are two failures. A bad tile server
wants **Try again** — which remounts the map, the only honest way to restart a
build that owns a GL context. A phone that cannot manage the full scene wants
**Use the lightweight view**, which is the low-data path that already exists.

Stages are reported only during the opening sequence. Every floating-origin
shift calls the same function, and a rider two hundred kilometres down the
line does not want "Laying the track" flashing up each time.

**Verified:** the frame was observed in the live DOM during a real page load —
`Preparing the corridor` — with a mutation observer rather than a screenshot,
because on a fast machine it is gone in under 25 ms and a screenshot simply
misses it.

## P0-8 — Tree canopy clearance, measured against the line

**Problem.** The tree belt offsets each tree perpendicular to the line at its
own sample, then jitters it up to 16.5 m *along the tangent* — a straight line,
on a route that curves. On the tight curves out of Pretoria and through the Hex
River pass the line bends back towards the tree while the tangent does not, so
a tree placed a clear 17 m from its own sample ended up inside the corridor a
few metres further on. The train ran through the leaves.

**Fix.** `distanceToTrack` measures a point against the whole sampled
centreline, not one sample, and anything short of the clearance is pushed
straight out until it is not. Two or three segment-distance passes per tree,
once per corridor rebuild — nothing per frame.

Building footprints were already checked against the line rather than by their
corners, which is what stopped Park Station being extruded around the train.

**Tests.** Added to `corridor.test.ts`: a 250 m-radius curve — tighter than
anything on this route — where the naive placement is shown to breach the
clearance, the correction is shown to fix it, and the fix is shown not to
overshoot. Plus the degenerate cases: no samples, one sample, a zero-length
segment.

**Also fixed.** That suite ended with `process.exit()`, which returns `never` —
so anything appended after it was unreachable code that TypeScript typed as
`never` and refused to compile. It now ends the way every other suite does.

**Verified:** tsc clean · 468 assertions across eight suites · 105 layout
measurements clean · build 2.59 MB.

## P0-9 — Demonstration mode, finished

**Problem.** Demo mode pinned the ride's position and speed and turned off
every location prompt, which was the hard part. Two gaps remained, and both
would have shown on stage.

A judge opening `?demo=1` on a fresh phone had no saved itinerary, so
`buildLeg` had nothing to build and the readout fell back to kilometres — the
journey clock, which is the part of the model worth showing, would not have
appeared at all.

And a teammate opening the demo link on their own phone would have had their
real trip and their chosen modes overwritten by it, with no way back.

**Fix.** A known-good itinerary — Pretoria to Cape Town on a fixed date, so
the rehearsal and the performance show the same clock — written on entry and
*taken back* on exit. Whatever was on the device is backed up first and
restored the moment demo mode is switched off. Re-entering does not overwrite
that backup, which is the bug that would otherwise strand a real trip for
good: every navigation inside the demo re-runs the same code.

A preload warms the ground around the demo's opening kilometres so the first
frame is the Hex River mountains rather than grey. It is best-effort by
design: a demonstration on saturated venue wifi with no preload is still a
working demonstration; one that hangs on a preload is not.

## P0-10 — Offline reliability: what is in the package, and is it still good

**Problem.** The offline panel could say *something is stored*. It could not
say what, how big, or how old — and a download taken in July, against a route
file that has since been corrected, looked exactly like one taken this
morning. The one place that matters is nine hours from a signal.

Work waiting in the outbox was invisible too, so a passenger who wrote
something in the Karoo had no way to know it had not been sent.

**Fix.** Every download now writes a manifest: when it finished, which build
wrote it, how many photographs and tiles it holds. The panel reports the
contents, the size on the device, the estimated size before downloading, and
when it was taken.

Staleness is judged on two grounds, and the second matters more than the
first: a package older than thirty days is flagged, and a package written by a
different build is flagged immediately whatever its age, because that is what
a corrected route looks like. A package from before build stamps existed is
judged on age alone rather than being called stale for a reason we cannot
check. A clock skewed into the future is not called stale either.

The outbox count appears in the panel when anything is waiting, with what
happens to it — "they go out when you have signal".

**Tests.** `demoOffline.test.ts`, 54 assertions. The demo half checks the
prepared itinerary against the real timetable (both stations are ones the
service actually calls at), and checks restore-on-exit from every direction:
a fresh device, a teammate's device with real work on it, a re-entry that must
not clobber the backup, an exit that never started, a corrupt backup, and a
private-mode device where every write throws. The offline half checks the
staleness judgement at the window, either side of it, on a build change, on an
unknown build, and on a skewed clock.

**Verified:** tsc clean · 522 assertions across nine suites · 105 layout
measurements clean · build 2.59 MB.

## P1 — Security headers: the policy is now enforced, because it is checked

**Problem.** The Content-Security-Policy shipped report-only, with a comment
saying to watch the reports for a week and then enforce it. Nobody was going
to carry that out on a hackathon timeline, so the policy was decoration: it
blocked nothing and nobody read its reports.

**Fix.** `scripts/check-csp.mjs` replaces the watching. It derives every
origin the app actually contacts from the source, asserts the policy covers
each one under the right directive, and then serves the built app with that
exact header and loads it in a real browser, failing on any violation the
browser itself reports.

It found four gaps the policy had while it sat harmlessly in report-only:

- `services.arcgisonline.com` — the imagery-capture-date lookup.
- `api.openstreetmap.org` — the rail-geometry fetch.
- `www.youtube-nocookie.com` — the two Shosholoza recordings. There was no
  `frame-src` at all, so the cultural feature would have been blocked outright
  the moment the policy was enforced.
- `s3.amazonaws.com` **in `img-src`** — the elevation tiles are decoded as
  *images*, not fetched, so `connect-src` alone was not enough. Reading the
  policy did not catch this one. The browser did, with 120 blocked tiles and
  a flat, featureless terrain — on every device, silently.

That last one is the argument for the whole script. The policy is enforced
now, and `npm run verify` runs typecheck, tests, build, the CSP check and the
layout check in one command.

## P1 — Source-grounded answers

**Problem.** The guide's own welcome line says "every answer comes from
documents written and checked for this route", and then showed the answer with
nothing to back it up. For an app whose pitch is that nothing is invented,
that was the one claim the interface could not afford to leave unsupported.

**Fix.** Every answer now carries its provenance, and the provenance is honest
rather than decorative. The temptation was to attach a citation to each of the
33 documents; most of this corpus is the team's own editorial writing, and
inventing a source for it would have been worse than having none. So there are
five sources and one of them says so out loud:

- **Published timetable** — seat61, with the link and the date checked.
- **Measured from the route geometry in this app.**
- **The app's own places dataset.**
- **How this app works** — for questions about the app, including every
  guarded reply, which is the app speaking about itself rather than a
  retrieved document.
- **Written by the 4GeeksSake team — not quoted from a source.**

The fallback cites nothing, because it drew on nothing.

**Tests.** Added to `guide.test.ts`: every document has a source, every source
label is readable, no source claims a link it does not have, every id in the
mapping is a real document, a journey question cites the timetable, a guarded
reply is not presented as retrieved, the fallback cites nothing, and the two
answer shapes never disagree.

**Also.** That suite's `check()` takes a boolean, not an actual-and-expected
pair, and the assertions added here were written in the other suites' form.
They would have passed on a truthy second argument regardless of the answer —
tests that could not fail. They are in the right form now.

**Verified:** tsc clean · 546 assertions across nine suites · CSP clean and
enforced · 105 layout measurements clean · build 2.59 MB.

## P1 — Accessibility, audited rather than asserted

**Problem.** "We did an accessibility pass" is a claim nobody can check and
everybody makes. Nothing in this project measured it.

**Fix.** `scripts/check-a11y.mjs` runs axe-core — the engine behind most
browser accessibility extensions — against the built app in a real browser,
across eight routes, in both the light and dark colour schemes, and fails on
any violation. It reports the measured colour pair and the selector, not just
the rule name, so a fix can be made once at the right declaration instead of
guessed at.

It found two rules, both real, and both worse than they looked:

**Colour contrast.** The brand gold `#f4bd4f` was being used as text on the
pale paper at **1.54:1** — effectively invisible, eighteen times on the home
page alone. It was never a text colour; it was a brand colour used as one.
There are now two golds and the difference is stated: `--gold` for dark
surfaces, where it measures 10:1, and `--gold-ink` for light ones, at 5.87:1.
The "dark gold" was `#d4a035` at 2.36:1 on white — the province label on every
stop card on the home page. The body grey was 3.90:1, below AA, on every page.
And in three places a label was dimmed with `opacity: .6`, including the
timetable's own column headings and the offline panel's stat labels — opacity
fades a colour towards the background and takes the contrast with it, so
"quieter" was being paid for in legibility.

The one that mattered most: `.tan-credit--unknown`, the *"Not yet verified"*
label on the Shosholoza recordings, at 4.39:1. That label is the honesty guard
for the whole cultural feature, and it was the hardest thing on the page to
read.

**Links inside sentences.** A link in running text was distinguishable from
the text around it by colour alone — so somebody who cannot see the colour
difference could not see that it was a link. Links inside prose are underlined
now, which is the right default anyway; links that are buttons, cards or
navigation are not running text and keep their own styling.

**Verified:** `node scripts/check-a11y.mjs --all` — clean at every severity,
including moderate and minor, on all eight routes in both colour schemes.
`npm run verify` now runs typecheck, tests, build, CSP, accessibility and
layout in one command.
