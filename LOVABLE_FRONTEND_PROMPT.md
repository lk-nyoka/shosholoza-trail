# Lovable prompt — Shosholoza Trail frontend rebuild

Copy everything below this line into Lovable.

---

Build a complete, production-ready frontend for **Shosholoza Trail**, a digital tourism companion for the 1,582 km Pretoria-to-Cape Town rail corridor.

## Non-negotiable reference

The visual reference is the existing website:

**https://shosholozatrail.giftvundla22.workers.dev/**

Before writing code, inspect the reference homepage and these routes:

- `/`
- `/journey`
- `/ride`
- `/destinations`
- `/stories`
- `/ai`
- `/plan`
- `/app`

Recreate the reference’s visual identity and composition with extremely high fidelity. The result should feel like the same premium product and design system—not a reinterpretation and not a generic dashboard.

Implement it from scratch. Do not scrape or copy the reference website’s source code. Do not reuse images unless their licence permits it. Use licensed Unsplash or equivalent South African travel photography and include a photograph-credits route.

## Critical design instruction

Do **not** use the common AI-generated SaaS/dashboard look.

Avoid:

- Cosmic black or purple backgrounds.
- Neon cyberpunk treatments.
- Excessive glassmorphism.
- Floating translucent cards everywhere.
- Random gradients.
- Giant rounded rectangles.
- Pill-shaped containers used for ordinary content.
- Generic analytics widgets.
- Excessive iconography.
- Dense map controls that compete with editorial content.
- Inter, Roboto or another generic application font as the main brand typography.
- Placeholder copy, fake charts or meaningless decorative UI.

This product should feel like a luxury South African travel publication combined with an elegant railway experience.

## Exact visual language

Use the reference’s measured visual foundation:

- Display typeface: **Fraunces**, falling back to Georgia and serif.
- Body/interface typeface: **Outfit**, falling back to a clean system sans-serif.
- Warm paper background: `#f8f2e8`.
- Editorial ink: `#1e2635`.
- Primary navy: approximately `#14243a`.
- Dark map/control navy: approximately `#0d1c2e`.
- Signature gold: `#f4bd4f`.
- Hero typography: warm white, approximately `#fffaf0`.
- Muted body copy: warm grey-blue, never pure grey.
- Buttons: restrained gold primary button with dark navy text; secondary buttons should be transparent with thin warm-white borders.
- Desktop border radius: restrained. Use approximately 12–20 px for cards and `999px` only for true buttons or compact status controls.
- Shadows: deep, broad and subtle. Avoid glows except for a very restrained train-position halo.

Typography should drive the design. Use generous editorial line breaks, elegant serif headings, small uppercase gold eyebrow text with wide tracking, and calm body copy.

## Global navigation

Create the same navigation hierarchy as the reference:

- ST monogram and “Shosholoza Trail” wordmark.
- Home.
- The Journey.
- The Ride.
- Destinations.
- Stories.
- AI Guide.
- Plan Your Trip.
- Live Journey.
- Gold “Start Ride” call to action.

On photographic pages, the navigation should sit transparently over the image. On cream editorial pages, use a cream or white navigation surface with dark text. On mobile, use a refined menu drawer that preserves the same typography and colours.

## Homepage composition

Match the reference homepage closely.

The first viewport must be a full-bleed cinematic South African passenger-train photograph with a deep blue atmospheric overlay. The train should remain visible near the bottom of the frame. The hero content is left aligned inside a centered max-width container with substantial top breathing room.

Use this exact content hierarchy:

- Gold eyebrow: `PRETORIA → CAPE TOWN · 8 STOPS`
- Large Fraunces headline across deliberate lines:
  - `The country goes`
  - `past`
  - gold italic/accent line: `at window height.`
- Body copy: `Shosholoza Trail turns the 1,582 km rail journey across South Africa into something you can watch unfold — with the stories, food and people of every town appearing exactly as you reach them.`
- Gold primary action: `Enter The Ride`
- Outlined secondary action: `Ask the AI Guide`
- Statistics: `1582 km / Distance`, `27 hours / On the rails`, `8 / Towns & cities`.

Below the hero, continue onto the warm cream editorial canvas. Include:

- Eyebrow: `THE LINE`.
- Fraunces heading: `Eight places that change the moment you look out of the window.`
- Editorial destination cards for Pretoria, Johannesburg, Kimberley, De Aar, Beaufort West, Matjiesfontein, Worcester and Cape Town.
- Cards should use high-quality destination photography, province and kilometre metadata, a large serif place name and one excellent sentence of editorial copy.
- A section promoting the source-grounded AI guide.
- A restrained navy footer with photograph credits.

Do not turn the homepage into a dashboard. It is an editorial landing experience.

## Journey page composition

The `/journey` route must match the reference’s full-screen spatial composition:

- Full-viewport satellite map of Southern Africa.
- Minimal transparent header with the ST logo at top left.
- “Follow train” and “All destinations” controls at top right.
- Dark navy route-summary card at upper left containing:
  - `THE ROUTE`
  - `Pretoria → Cape Town`
  - `1582 km / Distance`
  - `27 hrs / Journey`
  - `8 / Stops`
- A compact vertical map-style switcher beside the summary card with Streets, Terrain, Night, Satellite and Hybrid options.
- A small provenance label: `Mapped rail geometry / OSM mapped connected candidate`.
- A train-position marker with a subtle gold halo.
- A dark navy next-stop editorial card at the lower right containing a destination image, `NEXT STOP`, destination name, kilometres ahead, editorial description, local-story detail and a gold exploration button.
- A dark navy media-style timeline spanning the full bottom edge, with play/pause, route progress, station labels, current kilometre, percentage and `1× / 2× / 4×` speed controls.

The map must remain the dominant visual surface. Controls should feel embedded into the cinematic map rather than placed in a generic dashboard grid.

Use the existing connected railway geometry from the backend instead of drawing straight lines between stops.

## Ride page

The `/ride` route should reproduce the reference’s immersive first-person rail-world experience:

- Full-screen geographic/satellite scene.
- “Route overview” back control.
- Sound toggle UI, but never autoplay audio.
- Mapped-geometry provenance text.
- Landmark bearings labelled LEFT, AHEAD and RIGHT.
- Nearby-landmarks panel.
- Travel distance and distance-to-next-stop HUD.
- Look-left, look-right, look-up and look-down controls.
- Step-back, auto-ride and step-forward controls.
- `1× / 4× / 16×` speed selector.
- Discovered-places navigation for all eight stops.

If true first-person 3D terrain cannot be implemented reliably, create a polished camera-follow satellite ride using the real route geometry. Do not fake a 3D scene with decorative CSS.

## Destinations and local commerce

The `/destinations` route must be an editorial travel directory, not an e-commerce grid.

For every stop include:

- Province.
- Route kilometre.
- Large destination photograph.
- Editorial description.
- Clear `Attractions` section.
- Clear `Local Vendors` section.
- Distance from the station.
- Rating and category.
- Save/favourite action.

Current stops:

1. Pretoria — 0 km.
2. Johannesburg — 69 km.
3. Kimberley — 552 km.
4. De Aar — 788 km.
5. Beaufort West — 1,047 km.
6. Matjiesfontein — 1,277 km.
7. Worcester — 1,425 km.
8. Cape Town — 1,582 km.

Use South African travel photography with consistent grading and correct alt text. Vendor UI should feel curated and trustworthy, not like advertising banners.

## Stories, AI guide and planning pages

- `/stories`: editorial long-form story index with strong Fraunces typography, large photography and reading-time metadata.
- `/ai`: a calm source-grounded travel-guide interface using the same cream/navy/gold identity. Make clear that answers are based on verified corridor content. Do not make it look like a generic chatbot clone.
- `/plan`: an elegant journey-planning form for origin, destination, travel date, passengers and accessibility needs.
- `/app`: the practical live-journey view containing telemetry, ETA, route progress, disruption guidance and nearby recommendations while preserving the same Gift visual identity.
- `/credits`: image sources, authors and licence information.

## Existing backend contract

This task is **frontend only**. Do not create Supabase, Firebase, a second backend, mock database migrations or new server functions.

Create a typed API layer that reads `VITE_API_BASE_URL`, defaulting to `/api/v1`, and integrates with these existing endpoints:

- `GET /api/v1/route` — GeoJSON `Feature` with a connected `LineString`; coordinates are `[longitude, latitude]`.
- `GET /api/v1/stops` — all stops and their places.
- `GET /api/v1/stops/{stop_id}` — one stop.
- `GET /api/v1/stops/{stop_id}/places?type=attraction`.
- `GET /api/v1/stops/{stop_id}/places?type=vendor`.
- `GET /api/v1/journeys/pretoria-cape-town/status?current_km={number}`.
- `POST /api/v1/telemetry/pings`.

Telemetry payload:

```json
{
  "journey_id": "pretoria-cape-town",
  "session_id": "client-generated-random-id",
  "latitude": -25.7461,
  "longitude": 28.1881,
  "accuracy_metres": 20,
  "speed_kmh": 68
}
```

Never request geolocation on page load. Only request it after the user selects **I'm at this point**. Render none, low, medium and high confidence states and the rolling ETA returned by the API.

Provide a graceful offline state. Static route and destination content may be bundled as a fallback, but API responses must remain the primary source.

## Technology constraints

Use:

- React 18.
- TypeScript with strict types.
- Vite.
- React Router.
- Leaflet with React Leaflet, or MapLibre GL JS if required for exact satellite-map parity.
- Lucide React for functional icons.
- CSS modules, a well-structured global stylesheet or Tailwind with explicit reusable design tokens.

Do not mix multiple icon libraries. Do not use emoji as production icons. Do not insert base64 placeholder images.

Organize the project into reusable components and route-level pages. Suggested structure:

```text
src/
├── api/
├── components/
│   ├── layout/
│   ├── map/
│   ├── journey/
│   └── destinations/
├── hooks/
├── pages/
├── styles/
├── types/
├── App.tsx
└── main.tsx
```

## Map and animation requirements

- Render the route from the GeoJSON returned by `/api/v1/route`.
- Split the line into travelled and remaining portions.
- Interpolate along cumulative geographic distance, not raw coordinate-array index.
- Drive train movement with `requestAnimationFrame`.
- Use elapsed frame time so motion is refresh-rate independent.
- Use `animate: false` for camera updates while follow mode is active.
- Use `ResizeObserver` with `invalidateSize({ pan: false })` for Leaflet or `.resize()` for MapLibre.
- Cancel animation frames and observers when components unmount.
- Disable CSS transitions on map marker containers so CSS cannot fight coordinate updates.
- Respect `prefers-reduced-motion`.
- Keep map attribution visible.

## Responsive requirements

Design and verify these exact layouts:

- Desktop: 1440 × 900.
- Tablet: 1024 × 768.
- Mobile: 390 × 844.

On mobile:

- Preserve the editorial feeling.
- Do not merely stack every desktop card.
- Use a compact navigation drawer.
- Keep map controls thumb-accessible.
- Convert wide map cards into deliberate bottom sheets where appropriate.
- Ensure the playback timeline remains usable without covering essential content.
- Use safe-area insets for iOS.

## Quality bar

The finished application must look deliberately art-directed, not generated from a UI kit. Every spacing decision, type scale, image crop and component hierarchy should match the reference’s quiet luxury.

Required quality checks:

- No horizontal overflow at any target viewport.
- No overlapping controls.
- No clipped destination content.
- No missing images.
- No console errors or warnings.
- No TypeScript errors.
- All loading, empty, offline, error and disruption states designed.
- WCAG AA contrast for functional text and controls.
- Visible keyboard focus states.
- Semantic landmarks and correctly ordered headings.
- Buttons must have accessible names.
- Images must have meaningful alt text.
- Lazy-load below-the-fold photographs.
- Keep the initial JavaScript bundle lean through route-level code splitting.

## Definition of done

Deliver the complete frontend project, not a static mock-up and not a single hero section.

It must include:

- Every route listed above.
- All responsive styles.
- Typed API integration.
- Working map and journey playback.
- Working stop selection.
- Attraction and vendor filtering.
- Passenger geolocation action.
- Telemetry-confidence display.
- Disruption and alternate-shuttle presentation.
- Offline, loading and error states.
- A credits page.
- A complete README with installation, development, build and environment-variable instructions.
- An `.env.example` containing `VITE_API_BASE_URL=http://127.0.0.1:8001/api/v1`.

Do not stop after scaffolding. Do not leave TODOs, placeholder cards, lorem ipsum, non-functional buttons or comments saying functionality should be added later.

At the end, run the TypeScript check and production build, fix every error, and provide a concise file-by-file summary of what was created.

---

End of prompt.
