export interface RouteValidationResult {
  valid: boolean;
  featureCount: number;
  coordinateCount: number;
  errors: string[];
  warnings: string[];
}

function countLineCoordinates(geometry: any): number {
  if (!geometry) return 0;
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.length;
  }
  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.reduce(
      (sum: number, line: unknown) => sum + (Array.isArray(line) ? line.length : 0),
      0,
    );
  }
  return 0;
}

export function validateRouteGeoJson(data: any): RouteValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    return {
      valid: false,
      featureCount: 0,
      coordinateCount: 0,
      errors: ["Route must be a GeoJSON FeatureCollection."],
      warnings,
    };
  }

  const lineFeatures = data.features.filter((feature: any) =>
    ["LineString", "MultiLineString"].includes(feature?.geometry?.type),
  );
  const coordinateCount = lineFeatures.reduce(
    (sum: number, feature: any) => sum + countLineCoordinates(feature.geometry),
    0,
  );

  if (lineFeatures.length === 0) errors.push("No LineString/MultiLineString route features found.");
  if (coordinateCount < 2) errors.push("Route does not contain enough coordinates to animate a vehicle.");
  if (data.features.length !== lineFeatures.length) {
    warnings.push("Non-line features are present and will be ignored by the route follower.");
  }

  return {
    valid: errors.length === 0,
    featureCount: lineFeatures.length,
    coordinateCount,
    errors,
    warnings,
  };
}
