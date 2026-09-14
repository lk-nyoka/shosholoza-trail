# Shosholoza Trail — Project Handover

Last updated: 9 September 2026

## 1. Project summary

Shosholoza Trail is a map-led digital companion for the Pretoria-to-Cape Town rail journey. It combines an animated rail experience with nearby attractions, local vendors, passenger-generated position reports, journey status and disruption guidance.

The implementation lives in the standalone `ShosholozaTrail-Frontend` directory under `GKHack26`. The existing `Prototype` directory was not modified.

The project currently contains:

- An original Shosholoza Trail visual identity and logo assets.
- A responsive React and TypeScript frontend.
- A cinematic train-follow map animation.
- Connected OpenStreetMap railway geometry.
- Attraction and vendor discovery around story stops.
- An installable offline-capable Progressive Web App.
- A FastAPI backend for route data, places, passenger telemetry and journey status.
- SQLite development persistence and PostgreSQL-compatible database configuration.
- Automated backend tests and a production frontend build pipeline.
- A production container definition for the API.

## 2. Product experience

### Journey map

The main journey view displays the Pretoria-to-Cape Town corridor on a Leaflet map using OpenStreetMap tiles. The interface includes:

- A mapped railway line rather than a straight illustrative connection.
- A dark remaining-route layer and amber travelled-route layer.
- A moving train marker.
- A follow-camera mode that keeps the train in view.
- Play and pause controls.
- `1×`, `4×` and `12×` playback speeds.
- A journey scrubber for manually selecting progress.
- Current distance travelled and distance to the next story stop.
- Clickable stop markers.
- A visible OpenStreetMap provenance and connectivity badge.

### Destination discovery

The interface recommends local experiences around selected stops. Recommendations are divided into:

- Attractions such as landmarks, heritage sites and nature experiences.
- Vendors such as markets, cafés, food producers and craft studios.

The current editorial story stops are:

1. Pretoria
2. Johannesburg
3. Kimberley
4. De Aar
5. Beaufort West
6. Matjiesfontein
7. Worcester
8. Cape Town

Each stop includes its province, route distance, geographic position, destination teaser and associated place cards.

### Passenger-powered status

Travellers can select **I'm at this point** to share a browser geolocation reading with the API. The application:

- Requests location only after the traveller acts.
- Generates a random browser session identifier.
- Sends latitude, longitude, accuracy and device speed when available.
- Displays whether the ping was accepted.
- Uses accepted readings to calculate rolling journey speed and ETA.
- Shows the number of recent pings and a confidence level.
- Falls back to a clearly identified demonstration baseline when passenger data is unavailable.

### Disruption experience

The UI contains a demonstration disruption state designed to explain:

- The affected route section.
- The disruption message.
- Interim shuttle or transfer instructions.
- Where passengers should continue their trip.

The backend also includes a disruption database model and returns active disruptions in journey-status responses. An authenticated operator administration interface has not yet been implemented.

## 3. Brand and interface system

The implemented visual direction uses:

- Deep navy as the primary brand colour.
- Warm cream surfaces for editorial content.
- Amber and gold for the active rail route and calls to action.
- Large editorial typography combined with compact operational labels.
- Rounded map controls, destination cards and journey-status panels.
- Responsive desktop and mobile layouts.

Accessibility work includes:

- Semantic headings and landmarks.
- Keyboard-accessible buttons and controls.
- Visible focus states.
- Accessible names on journey controls.
- An `aria-live` journey-status region.
- A skip link to destination recommendations.
- Reduced-motion support.
- Responsive navigation for smaller screens.

Brand assets are located in:

- `public/logo.png`
- `public/icon.svg`

The primary visual implementation is split across:

- `src/styles.css`
- `src/brand-v2.css`
- `src/animation.css`

## 4. Railway geometry

### Source

The railway line is generated from OpenStreetMap `railway=rail` ways obtained through the Overpass API. The data is © OpenStreetMap contributors and licensed under ODbL 1.0.

Current generated metadata:

| Property | Value |
| --- | --- |
| Connected candidate | Yes |
| Output coordinates | 7,049 |
| Raw coordinates processed | 16,384 |
| OSM ways processed | 10,444 |
| Mapped geometry distance | 1,599.39 km |
| Product journey distance | 1,582 km |
| Data fetched | 9 September 2026 |

The connected extraction uses the following route anchors:

`Pretoria → Germiston → Johannesburg → Potchefstroom → Klerksdorp → Bloemhof → Christiana → Warrenton → Kimberley → De Aar → Beaufort West → Matjiesfontein → Worcester → Wellington → Bellville → Cape Town`

### Geometry generator

`scripts/fetch_osm_rail.py` performs the following work:

1. Queries railway ways near each station-to-station corridor.
2. Builds an undirected railway graph.
3. Selects the most suitable connected component.
4. Finds a shortest connected railway path with Dijkstra's algorithm.
5. Checks endpoint gaps and segment connectivity.
6. Caches extracted corridor segments in `.cache/osm-rail`.
7. Generates both frontend TypeScript and backend JSON outputs.

Generated geometry files:

- `src/rail-geometry.ts` for the bundled frontend route.
- `backend/app/data/route-geometry.json` for the API GeoJSON endpoint.

This is a graph-connected mapped candidate for passenger information and demonstration purposes. It is not an operator-certified operational path and must not be used for railway control, dispatch or safety decisions without validation by PRASA, Transnet or the relevant infrastructure operator.

## 5. Animation and map stability

The journey animation uses `requestAnimationFrame` rather than `setInterval`, allowing movement to follow the browser's rendering cycle. Elapsed frame time is used to update progress consistently across different refresh rates.

Map stability work includes:

- A `ResizeObserver` watching the map container.
- A browser resize listener.
- An initial delayed Leaflet `invalidateSize()` call after layout settlement.
- `invalidateSize({ pan: false, debounceMoveend: true })` to avoid unwanted map jumps.
- Camera updates throttled separately from train movement.
- Non-animated Leaflet `panTo` updates while follow mode is active.
- CSS transitions explicitly disabled on the map container and Leaflet marker elements.
- Decorative animation disabled on the moving train itself so it cannot fight Leaflet positioning.

Browser verification confirmed:

- The train position changes continuously while playback is active.
- The map contains two route layers and a single moving train marker.
- Marker transitions resolve to `none`.
- The map recalculates correctly at a 390 × 844 mobile viewport.
- The map recalculates correctly at a 1440 × 900 desktop viewport.
- No frontend warnings or errors occurred in a clean browser session.

## 6. Frontend architecture

### Technology

- React 18
- TypeScript
- Vite 7
- Leaflet and React Leaflet
- Lucide icons
- Vite PWA

### Important frontend files

| File | Responsibility |
| --- | --- |
| `src/main.tsx` | React application entry point. |
| `src/App.tsx` | Main interface, map, animation, journey controls and discovery experience. |
| `src/api.ts` | Typed backend API client and passenger geolocation submission. |
| `src/data.ts` | Frontend stop and recommendation content. |
| `src/rail-geometry.ts` | Generated railway coordinates and OSM metadata. |
| `src/styles.css` | Core layout and component styling. |
| `src/brand-v2.css` | Brand refinement and final visual system. |
| `src/animation.css` | Motion, marker and transition rules. |
| `src/vite-env.d.ts` | Vite environment variable TypeScript declarations. |
| `vite.config.ts` | React, API proxy and PWA configuration. |
| `public/logo.png` | Primary raster logo. |
| `public/icon.svg` | Scalable application and PWA icon. |

### Progressive Web App

The Vite PWA setup provides:

- An installable web-app manifest.
- Automatic service-worker updates.
- Offline precaching for the application shell.
- Cache-first OpenStreetMap tile caching.
- Cache-first recommendation-image caching.
- A standalone application display mode.

OpenStreetMap tile caching is limited to 120 entries with a seven-day lifetime. Place imagery is limited to 40 entries with a 30-day lifetime.

### Frontend environment

The API base URL is read from:

```text
VITE_API_BASE_URL
```

When the variable is not supplied, the frontend uses `/api/v1`. During development, Vite proxies `/api` to `http://127.0.0.1:8001`.

## 7. Backend architecture

### Technology

- Python
- FastAPI
- SQLModel
- Pydantic
- Uvicorn
- SQLite for local development
- PostgreSQL-compatible database configuration for scaled deployment

### Backend files

| File | Responsibility |
| --- | --- |
| `backend/app/main.py` | FastAPI application, middleware and HTTP routes. |
| `backend/app/config.py` | Environment-driven application settings. |
| `backend/app/database.py` | Database engine, sessions and initialisation. |
| `backend/app/models.py` | Passenger-ping and disruption database models. |
| `backend/app/schemas.py` | Validated API request and response models. |
| `backend/app/services.py` | Route snapping, distance calculation, telemetry validation, speed, ETA and disruptions. |
| `backend/app/seed.py` | Initial destination, attraction and vendor content. |
| `backend/app/data/route-geometry.json` | Generated route geometry served by the API. |
| `backend/tests/test_api.py` | Automated API tests. |
| `backend/requirements.txt` | Pinned Python dependencies. |
| `backend/Dockerfile` | Production API container. |
| `backend/.env.example` | Documented runtime configuration. |
| `backend/README.md` | Backend-specific run and deployment notes. |

### Request flow

```text
Browser
  ├── static React/PWA assets
  ├── OpenStreetMap map tiles
  └── /api/v1 requests
          ↓
      FastAPI
        ├── route geometry JSON
        ├── static destination content
        ├── validation and route snapping
        └── SQLModel database
              ├── passenger_pings
              └── disruptions
```

## 8. API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health and environment. |
| `GET` | `/api/v1/route` | Connected rail route as a GeoJSON `LineString`. |
| `GET` | `/api/v1/stops` | All editorial story stops and places. |
| `GET` | `/api/v1/stops/{stop_id}` | One stop and its places. |
| `GET` | `/api/v1/stops/{stop_id}/places` | Places at a stop, optionally filtered by `type=vendor` or `type=attraction`. |
| `GET` | `/api/v1/journeys/{journey_id}/status` | Current distance, speed, ETA, confidence and disruption state. |
| `POST` | `/api/v1/telemetry/pings` | Validate, anonymise, snap and store a passenger position report. |

The current journey identifier is:

```text
pretoria-cape-town
```

Interactive OpenAPI documentation is available at `/docs` whenever the backend is running.

## 9. Telemetry implementation

Passenger position reports accept:

- Journey identifier.
- Random client session identifier.
- Latitude and longitude.
- Accuracy in metres.
- Optional speed in kilometres per hour.

The API then:

1. Rejects unknown journeys.
2. Rejects readings with insufficient GPS accuracy.
3. Hashes the session identifier with SHA-256 before storage.
4. Applies a per-session ping interval.
5. Finds the closest coordinate on the mapped route.
6. Calculates cumulative route distance rather than relying on coordinate-array density.
7. Rejects readings too far from the rail corridor.
8. Stores an accepted ping.
9. Recalculates rolling speed, ETA and confidence.

Journey confidence is currently classified from recent ping volume:

- `none`: no recent pings.
- `low`: 1–3 recent pings.
- `medium`: 4–9 recent pings.
- `high`: 10 or more recent pings.

Speed calculation uses positive recent speed readings. Larger samples are trimmed at both ends to reduce the effect of outliers. When no passenger speed is available, the product uses a clearly labelled 72 km/h demonstration baseline.

## 10. Security and operational safeguards

The API currently provides:

- Strict request validation with unknown fields rejected.
- Geographic coordinate bounds for the supported South African corridor.
- GPS accuracy limits.
- Maximum plausible speed validation.
- Route-distance validation.
- Rate limiting through recent database pings.
- Hashed passenger session identifiers.
- Trusted-host middleware.
- Configurable CORS origins.
- GZip compression.
- Route-response caching headers and an ETag.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- A strict referrer policy.
- A permissions policy limiting camera, microphone and geolocation access.
- SQLite WAL mode for safer local concurrent access.
- Database connection health checking.
- A non-root user in the production Docker image.

## 11. Environment configuration

Backend variables are documented in `backend/.env.example`:

| Variable | Purpose |
| --- | --- |
| `SHOSHOLOZA_ENV` | Runtime environment name. |
| `SHOSHOLOZA_DATABASE_URL` | SQLite or PostgreSQL connection URL. |
| `SHOSHOLOZA_CORS_ORIGINS` | Comma-separated allowed frontend origins. |
| `SHOSHOLOZA_TRUSTED_HOSTS` | Comma-separated accepted HTTP hosts. |
| `SHOSHOLOZA_PING_RATE_LIMIT_SECONDS` | Minimum interval between session pings. |
| `SHOSHOLOZA_MAX_PING_ACCURACY_METRES` | Maximum accepted browser geolocation uncertainty. |
| `SHOSHOLOZA_MAX_ROUTE_DISTANCE_KM` | Maximum allowed distance from the mapped route. |

Production values must replace the local development origins and hosts before deployment.

## 12. Running the complete project locally

### Backend

From `ShosholozaTrail-Frontend/backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

Backend URLs:

- API: `http://127.0.0.1:8001`
- Documentation: `http://127.0.0.1:8001/docs`

### Frontend

From `ShosholozaTrail-Frontend`:

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

Frontend URL:

```text
http://127.0.0.1:5174/#journey
```

The backend must run on port `8001` for the default Vite proxy to work.

## 13. Building and testing

### Frontend checks

```powershell
npm run build
npm audit --audit-level=moderate
```

Latest result:

- TypeScript compilation passed.
- Vite production build passed.
- PWA service worker generation passed.
- npm audit reported zero vulnerabilities.

### Backend checks

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Six automated tests currently cover:

- Health response and security headers.
- Connected GeoJSON route output.
- Vendor filtering at a stop.
- Successful route-snapped telemetry.
- Rejection of a position far from the route.
- Rejection of an unknown journey.

Latest result: **6 passed**.

## 14. Container deployment

From `backend`:

```powershell
docker build -t shosholoza-trail-api .
docker run --rm -p 8000:8000 `
  -e SHOSHOLOZA_TRUSTED_HOSTS=api.example.com `
  -e SHOSHOLOZA_CORS_ORIGINS=https://example.com `
  -v shosholoza-data:/data `
  shosholoza-trail-api
```

The frontend can remain on Cloudflare while the API runs on a Python-compatible container host. Build the frontend with `VITE_API_BASE_URL` pointing at the public API URL.

SQLite with a persistent volume is suitable for a single API instance. A managed PostgreSQL database should be used before deploying multiple API replicas.

## 15. Production status and remaining work

The current application is production-buildable and its implemented flows have been tested. The following items still require real organisations, data sources or product decisions before a public transport launch:

- Official operator validation of the mapped railway path.
- A reliable official source for schedules, delays, cancellations and platform changes.
- Authentication and role-based access for operator staff.
- Admin endpoints and an interface for creating and resolving disruptions.
- A vendor onboarding, approval and content-moderation workflow.
- Replacement of demonstration recommendation content with verified local business records.
- Database migrations and automated backups for production.
- Shared rate limiting when multiple backend replicas are used.
- Monitoring, alerting and structured production logs.
- Privacy policy, consent copy and a defined telemetry-retention period.
- End-to-end tests against the final deployed domains.
- HTTPS deployment and production secret management.

Passenger telemetry is crowdsourced. It is not official railway tracking and must be presented as an estimate unless an authorised operator feed is integrated.

## 16. Repository hygiene

The project `.gitignore` excludes:

- Node modules and frontend builds.
- Local environment files.
- OSM extraction caches.
- Python virtual environments and bytecode.
- Pytest cache files.
- SQLite databases and WAL files.

Generated route source files are intentionally kept in the project because both the offline frontend and API require them.

## 17. Current project structure

```text
ShosholozaTrail-Frontend/
├── backend/
│   ├── app/
│   │   ├── data/route-geometry.json
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── seed.py
│   │   └── services.py
│   ├── tests/test_api.py
│   ├── .env.example
│   ├── Dockerfile
│   ├── README.md
│   └── requirements.txt
├── public/
│   ├── icon.svg
│   └── logo.png
├── scripts/
│   └── fetch_osm_rail.py
├── src/
│   ├── animation.css
│   ├── api.ts
│   ├── App.tsx
│   ├── brand-v2.css
│   ├── data.ts
│   ├── main.tsx
│   ├── rail-geometry.ts
│   ├── styles.css
│   └── vite-env.d.ts
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.json
└── vite.config.ts
```

## 18. Ownership and licensing notes

- Application code and the original Shosholoza Trail interface were created for this project.
- Railway map data is derived from OpenStreetMap and remains subject to ODbL 1.0 attribution requirements.
- Map tiles are provided by OpenStreetMap and must retain visible contributor attribution.
- Current recommendation imagery is loaded from Unsplash URLs and should be reviewed or replaced with licensed vendor-owned photography before a commercial release.
- Inspiration informed the product direction, but the implemented interface and code are original rather than copied source material.

