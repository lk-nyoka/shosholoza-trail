# De Aar: Crossroads of the Rails

Source: the supplied De Aar Rail Chapter blueprint. This first implementation follows its data → parser → graph → resolver → map order. The original PDF is unchanged.

## Local data pipeline

1. `python scripts/extract-de-aar.py` reads the existing `data/provenance/south-africa-260907.osm.pbf`. No network call. It keeps complete OSM ways intersecting the station's 4.5 km radius, their node IDs and raw tags, plus nearby railway nodes. The raw extraction is immutable on subsequent runs. Its metadata records both source and extraction SHA-256 and the original snapshot date.
2. `node scripts/build-de-aar.mjs` verifies the raw checksum, parses railway geometry, builds primitive adjacent-node edges, excludes disused/abandoned/restricted ways from routing, and ranks exits at 3.2 km. Raw tags are retained; routing multipliers are application policy.
3. Derived data and checksums live in `data/deaar/derived`, copied to `public/data/deaar/v1` by the asset build.
4. `/de-aar` displays local MapLibre GeoJSON with no external tile dependencies. Destinations links to the inspector. Candidate highlighting is explicitly unreviewed.

## Topology and limits

Shared OSM nodes connect tracks. Geometric crossings do not. Mapped railway_crossing nodes are split by source way, conservatively preventing transfers; cross-way continuation through those nodes still needs review. Station routing origin is the nearest eligible main-track node, not the station POI itself. The resolver compares a tail bearing with the Beaufort West direction; that heuristic cannot certify the Hutchinson corridor. Nearby candidate scores are marked ambiguous. No reviewed critical route or operational authority is claimed.

## Still to implement

Review candidate exits against corridor evidence and freeze a reviewed fallback; add station/platform rendering and detailed diagnostics; integrate the existing train and audio; author the 35–45 second director camera sequence, deterministic scrubber, recovery modes and handoff. Full offline cold-start/service-worker coverage and the cinematic are not yet verified. Do not fabricate signal aspects or switch operations.

## Checks

`node --experimental-strip-types --test tests/deaar-graph.test.ts`

`npm run check:app` and `npm run build:app`

`node scripts/check-de-aar.mjs` verifies the inspector against localhost:8791 with external HTTP requests blocked, candidate selection, mobile layout and page errors.

## First extracted dataset and validation

204 track ways; 1,667 graph nodes; 1,720 edges; four components; 68 mapped switches; one mapped signal. The two best exits differ by fewer than 80 score units, so resolution is ambiguous and neither is certified. All four graph tests, app typecheck, production build and real-dataset checksum/continuity validation passed. Browser inspector passed with external HTTP blocked, candidate highlight working, no page errors and no mobile overflow. This does not constitute a full offline cold-start test.
