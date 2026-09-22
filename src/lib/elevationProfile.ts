/**
 * Elevation along the whole route, for the journey profile strip.
 *
 * Sampled from the same Mapzen terrarium DEM the 3D terrain uses, but at a much
 * lower zoom: a profile only needs the shape of the climb, and z9 tiles cover
 * roughly 78 km each, so the entire 1 568 km corridor costs a couple of dozen
 * tiles instead of thousands.
 *
 * This is the part of the journey the map cannot show you. Pretoria sits at
 * about 1,350 m, the Karoo plateau stays high, and the line then drops through
 * the Hex River mountains to sea level at Cape Town - a shape you feel on the
 * train and never see on a flat map.
 */
import { ElevationSampler } from "./geoTiles";
import { TOTAL_KM, positionAt } from "./routeIndex";

export interface ProfilePoint {
  km: number;
  metres: number;
}

export interface RouteProfile {
  points: ProfilePoint[];
  minMetres: number;
  maxMetres: number;
}

const SAMPLE_KM = 4;
let cached: Promise<RouteProfile> | null = null;

export function routeProfile(): Promise<RouteProfile> {
  if (cached) return cached;
  cached = (async () => {
    const sampler = new ElevationSampler(8);
    const coords: [number, number][] = [];
    for (let km = 0; km <= TOTAL_KM; km += SAMPLE_KM) coords.push(positionAt(km));

    let north = -90;
    let south = 90;
    let west = 180;
    let east = -180;
    for (const [lat, lon] of coords) {
      north = Math.max(north, lat);
      south = Math.min(south, lat);
      west = Math.min(west, lon);
      east = Math.max(east, lon);
    }
    await sampler.prefetch(north, south, west, east);

    const points: ProfilePoint[] = coords.map((latLng, index) => ({
      km: index * SAMPLE_KM,
      metres: Math.round(sampler.heightAt(latLng[0], latLng[1])),
    }));

    // A single dropped tile shows up as a 0 m spike in the middle of a plateau;
    // carry the previous reading rather than drawing a cliff that is not there.
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].metres <= 0 && points[index - 1].metres > 50) {
        points[index].metres = points[index - 1].metres;
      }
    }

    const values = points.map(point => point.metres);
    return {
      points,
      minMetres: Math.min(...values),
      maxMetres: Math.max(...values),
    };
  })();
  return cached;
}
