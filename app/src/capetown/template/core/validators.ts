import type { CameraPathKeyframe } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCameraPath(keyframes: CameraPathKeyframe[]): ValidationResult {
  const errors: string[] = [];
  if (keyframes.length < 2) errors.push("Camera path must contain at least 2 keyframes.");

  let lastTime = -1;
  keyframes.forEach((k, i) => {
    if (!Number.isFinite(k.timeMs) || k.timeMs < 0) errors.push(`Keyframe ${i}: invalid time.`);
    if (k.timeMs <= lastTime) errors.push(`Keyframe ${i}: times must increase.`);
    lastTime = k.timeMs;

    if (k.position.some((v) => !Number.isFinite(v))) {
      errors.push(`Keyframe ${i}: invalid position.`);
    }

    const qLen = Math.hypot(...k.quaternion);
    if (!Number.isFinite(qLen) || qLen < 0.5 || qLen > 1.5) {
      errors.push(`Keyframe ${i}: invalid quaternion.`);
    }

    if (k.fov !== undefined && (k.fov < 15 || k.fov > 120)) {
      errors.push(`Keyframe ${i}: FOV outside 15–120.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function validateGeoJsonLineRoute(input: unknown): ValidationResult {
  const errors: string[] = [];
  const data = input as any;

  if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    return { valid: false, errors: ["Expected a GeoJSON FeatureCollection."] };
  }

  const lines = data.features.filter((f: any) =>
    f?.geometry?.type === "LineString" || f?.geometry?.type === "MultiLineString"
  );

  if (!lines.length) errors.push("Route contains no LineString/MultiLineString.");

  const hasEnoughCoordinates = lines.some((f: any) => {
    const coords = f.geometry.coordinates;
    if (f.geometry.type === "LineString") return Array.isArray(coords) && coords.length >= 2;
    return Array.isArray(coords) && coords.some((line: any) => Array.isArray(line) && line.length >= 2);
  });

  if (lines.length && !hasEnoughCoordinates) {
    errors.push("Route line geometry contains too few coordinates.");
  }

  return { valid: errors.length === 0, errors };
}
