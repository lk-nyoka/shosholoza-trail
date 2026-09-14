/**
 * When the satellite imagery under the train was actually taken.
 *
 * Esri publishes acquisition metadata per location, and it answers a question a
 * judge will ask: is this real, current data or a stock texture? Measured along
 * this corridor: Pretoria 3 Oct 2025, Midrand 9 Oct 2025, Cape Town 8 Sep 2025,
 * the Karoo 26 Nov 2023 - so the populated sections are under a year old, which
 * is worth showing rather than leaving people to assume otherwise.
 */
export interface ImageryInfo {
  captured: string | null;
  source: string | null;
  resolutionM: number | null;
}

const ENDPOINT =
  "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify";

/** Cached per ~0.2 degree cell; imagery scenes are far larger than that. */
const cache = new Map<string, Promise<ImageryInfo>>();
const cellKey = (lat: number, lon: number) =>
  `${Math.round(lat / 0.2)}:${Math.round(lon / 0.2)}`;

export function imageryAt(lat: number, lon: number): Promise<ImageryInfo> {
  const key = cellKey(lat, lon);
  const cached = cache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    tolerance: "2",
    mapExtent: `${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}`,
    imageDisplay: "400,400,96",
    returnGeometry: "false",
    f: "json",
  });

  const pending = fetch(`${ENDPOINT}?${params}`)
    .then(response => response.json())
    .then((payload: { results?: { attributes?: Record<string, unknown> }[] }) => {
      const attributes = payload.results?.[0]?.attributes ?? {};
      const captured = (attributes.SRC_DATE2 ?? attributes.SRC_DATE) as string | undefined;
      const resolution = Number(attributes.SRC_RES);
      return {
        captured: captured ?? null,
        source: (attributes.SRC_DESC as string | undefined) ?? null,
        resolutionM: Number.isFinite(resolution) ? resolution : null,
      };
    })
    .catch(() => {
      cache.delete(key);
      return { captured: null, source: null, resolutionM: null };
    });

  cache.set(key, pending);
  return pending;
}

/** "Oct 2025" from Esri's M/D/YYYY, or null. */
export function shortCaptureDate(info: ImageryInfo): string | null {
  if (!info.captured) return null;
  const parsed = new Date(info.captured);
  if (Number.isNaN(parsed.getTime())) return info.captured;
  return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
