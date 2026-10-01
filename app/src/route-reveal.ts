// The travelled part of the route, drawn as the train covers it.
//
// Ported from TripTrail (MIT, Copyright (c) 2026 Fangyuan Lin), app.js:
// `setTrailReveal()` and the Mercator-fraction bookkeeping around
// `trailPointAt()`. Licence: public/licenses/triptrail-MIT.txt.
//
// The technique: give the GeoJSON source `lineMetrics: true` and paint the line
// with a `line-gradient` that steps from the route colour to transparent at the
// current progress. One paint-property write per update, all on the GPU - no
// rebuilding the line geometry every frame.
//
// The part that is easy to get wrong, and that TripTrail gets right:
// `line-progress` is a fraction of the line's length in *Mercator* units, not
// metres. Over the Pretoria-Cape Town corridor the Mercator scale changes by
// about 12% between 25.7 and 33.9 degrees south, so `metres / total` would put
// the reveal head hundreds of kilometres away from the train by the Karoo.
// Here the fraction is looked up through a Mercator cumulative length built on
// the same vertices as the metre cumulative.
import type { Coordinate } from './ride-model.ts';

/** Web Mercator in unit square coordinates, as MercatorCoordinate.fromLngLat. */
function mercator([lon, lat]: Coordinate): [number, number] {
  const phi = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return [(lon + 180) / 360, (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2];
}

export type RouteReveal = {
  /** The line-progress value at a distance along the route, in metres. */
  fraction(distanceMetres: number): number;
};

/**
 * @param coordinates The exact geometry given to the line source.
 * @param cumulative  Metres along that geometry at each vertex.
 */
export function createRouteReveal(coordinates: Coordinate[], cumulative: number[]): RouteReveal {
  const projected = coordinates.map(mercator);
  const mercatorCumulative = [0];
  for (let i = 1; i < projected.length; i++) {
    mercatorCumulative.push(mercatorCumulative[i - 1] + Math.hypot(projected[i][0] - projected[i - 1][0], projected[i][1] - projected[i - 1][1]));
  }
  const metresTotal = cumulative.at(-1) ?? 0;
  const mercatorTotal = mercatorCumulative.at(-1) || 1;

  return {
    fraction(distanceMetres: number) {
      const target = Math.max(0, Math.min(metresTotal, distanceMetres));
      // Binary search the metre cumulative, then take the same position along
      // that segment in the Mercator cumulative.
      let low = 0, high = cumulative.length - 1;
      while (low + 1 < high) {
        const middle = (low + high) >> 1;
        if (cumulative[middle] < target) low = middle; else high = middle;
      }
      const span = cumulative[high] - cumulative[low];
      const t = span > 0 ? (target - cumulative[low]) / span : 0;
      const along = mercatorCumulative[low] + (mercatorCumulative[high] - mercatorCumulative[low]) * t;
      return Math.max(0, Math.min(1, along / mercatorTotal));
    },
  };
}

/**
 * TripTrail's gradient: the route colour up to `fraction`, transparent after.
 * The floor keeps the step's input strictly positive, which MapLibre requires.
 */
export function revealGradient(fraction: number, colour: string) {
  return ['step', ['line-progress'], colour, Math.max(0.0001, Math.min(1, fraction)), 'rgba(0,0,0,0)'];
}
