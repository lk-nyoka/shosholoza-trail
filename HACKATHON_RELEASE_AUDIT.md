# Shosholoza Trail — Hackathon Release Audit

Audit date: 19 September 2026

This file records checks performed against the uploaded source package. It is deliberately explicit about what was verified and what could not be physically verified in this environment.

## Release summary

Shosholoza Trail is a React/TypeScript PWA for the Pretoria–Cape Town rail corridor. The current experience combines a 3D mapped ride, journey setup, destination discovery, local reservation prototypes, journey modes, an offline retrieval guide, GPS-based live positioning and a FastAPI telemetry/status service that is present in the repository but **not deployed by the current Netlify frontend configuration**.

## Route inventory

| Route | Surface | Purpose |
| --- | --- | --- |
| `/` | Home | Product story, corridor overview, primary CTAs |
| `/start` | Journey setup | Modes, board/alight stops, optional passenger details |
| `/trip` | My Journey | Boarding pass, route stops, reservations, offline download |
| `/ride` | The Ride | Interactive 3D rail-world simulation and journey modes |
| `/journey` | Route overview | Mapped simulated corridor overview and disruption preview |
| `/destinations` | Stops | Stop selector, dwell-time planning, attractions and vendors |
| `/stops/:stopId` | Stop hub | Stories, activities, creative/networking prompts and local places |
| `/stories` | Stories | Editorial corridor stories |
| `/shosholoza` | The Song | Cultural context and attribution |
| `/ai` | Guide | Offline TF-IDF retrieval over curated route documents |
| `/plan` | Plan | Trip-planning surface |
| `/app` | Live GPS | Device GPS, journey telemetry and status fallback |
| `/help` | Before You Board | Practical passenger information and disclaimers |
| `/privacy` | Privacy | POPIA-facing data behavior and deletion controls |
| `/credits` | Credits | Data, imagery and library attribution |
| `/operator` | Operator demo | Clearly labelled non-production operator prototype |
| `*` | 404 | Recovery page for unknown routes |

## Fixes applied in this audit

### P1 — journey modes did not respect “all off”

`saveModes([])` previously converted an empty choice back to all three modes, and `savedModes()` also treated an intentionally saved empty array as if nothing had ever been chosen. This contradicted both the onboarding copy and the ride-mode switch. Empty mode selections are now preserved across reloads.

### P1 — “delete everything” did not delete everything

The deletion utility only removed keys beginning with `st.`. The app also writes `shosholoza.session` and `shosholoza.saved-places.v1`, so the telemetry session identifier and saved places survived a deletion request. The erasure prefixes now cover both namespaces, and the My Journey delete action now calls the full erasure routine instead of deleting only the passenger record.

### P1 — Supabase configuration key mismatch

The supplied environment uses `VITE_SUPABASE_PUBLISHABLE_KEY`, while the client only read `VITE_SUPABASE_ANON_KEY`. The client now accepts the current publishable-key name and retains the legacy anon-key fallback. `.env.example` documents both.

### P1 — privacy/onboarding statements contradicted the implementation

The privacy page previously said the app asks for no name/contact details and that telemetry readings could not be linked to one another. Journey setup does ask for optional local-only name/contact data, while telemetry uses a persistent random browser session identifier and the backend hashes/uses it for rate limiting and rolling status. The copy now describes the implementation accurately, including optional anonymous Supabase sync and the limit of local-only deletion once server data has been sent.

### P2 — Netlify skipped the TypeScript build gate

Netlify ran `npx vite build`, while the normal project build is `tsc -b && vite build`. Netlify now runs `npm run build`, so a TypeScript failure can block a production deploy instead of being silently bundled.

### P2 — closed mobile navigation remained keyboard-focusable

The off-canvas drawer was translated out of view and marked `aria-hidden`, but its links could remain in the keyboard tab order. Closed state now also uses `visibility: hidden` and disabled pointer interaction, while preserving the opening animation.

### P2 — nested main landmark

`Layout` already owns the page-level `<main>`, while the stop-hub route rendered another `<main>` inside it. The nested landmark has been changed to a normal content container.

### P2 — static security headers tightened

The static frontend now explicitly permits geolocation only to self, denies framing through `X-Frame-Options: DENY`, and aligns the report-only CSP frame policy with `frame-ancestors 'none'`.

## Verification performed

- TypeScript project check: **PASS** (`tsc -b`).
- Frontend storage smoke test: **PASS** for default modes, intentional zero-mode persistence, single-mode persistence, telemetry-session erasure, saved-place erasure and preservation of unrelated keys.
- Backend automated tests: **PASS — 15 tests** in the audit environment. The bundled virtual environment was Windows-specific, so SQLModel 0.0.42 was loaded from the package while the host supplied compatible Linux FastAPI/Pydantic/SQLAlchemy dependencies.
- Netlify SPA fallback configuration: source configuration reviewed; all normal routes are directed to `index.html` after the explicit `/api/*` rule.
- External `target="_blank"` links: source scan confirmed `rel="noopener noreferrer"` on the reviewed external links.
- Plain insecure HTTP application endpoints: none found in shipped application source; local development URLs remain only in development configuration/documentation.

## Not physically verified in this environment

The audit environment could not launch its installed Chromium headlessly, so rendered desktop/mobile screenshots, pointer interaction, keyboard traversal, WebGL frame rate, actual font rendering and overlap checks are **NOT VERIFIED — tooling/environment limitation**. The uploaded `node_modules` was also Windows-specific and lacks Rollup's Linux native optional package; network package installation is unavailable here. TypeScript passes, but a fresh Vite bundle was therefore not regenerated in this environment.

The existing checked-in `dist/` was produced after the current source files, but it predates the fixes in this audit. Rebuild before deployment.

## Critical remaining release limitation

The public Netlify configuration explicitly maps `/api/*` to `api-unavailable.json` with HTTP 503. This is honest and prevents JSON callers from receiving the SPA shell, but it also means the repository's FastAPI telemetry/status service is **not live on the Netlify URL**. The offline-first product still runs, while passenger ping aggregation, server status, timetable/API calls and similar backend-backed demonstrations require a separately hosted API plus `VITE_API_BASE_URL`.

For a hackathon stage demo that must not depend on venue connectivity or GPS permission, use `?demo=1`. The interface visibly labels that state as a demonstration.

## Release gate

Current source status: **DEMO READY WITH MATERIAL BACKEND/RENDER-VERIFICATION RISKS**.

Before changing that to a full demo-ready release, rebuild on a clean environment, deploy the new `dist`, open every route on the public domain at mobile/tablet/desktop sizes, check console/network logs, and either deploy the FastAPI service or deliberately scope the judged demonstration to the offline/deterministic experience.
