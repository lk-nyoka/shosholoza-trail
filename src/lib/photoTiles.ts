import * as THREE from "three";
import type { LatLng } from "./geoTiles";

/**
 * Photorealistic / real 3D city geometry via OGC 3D Tiles, loaded into the
 * existing Three.js scene with 3d-tiles-renderer rather than switching the app
 * to CesiumJS.
 *
 * Two providers, tried in order:
 *
 *   Google Photorealistic 3D Tiles - actual photogrammetry: textured buildings,
 *     bridges, trees. This is the only source that looks like real life.
 *     Needs a Map Tiles API key AND the Map Tiles API enabled on the project.
 *
 *   Cesium ion (asset 2275207, Cesium OSM Buildings) - real global building
 *     geometry, untextured. A clear step up on extruded footprints, free, and
 *     the fallback whenever Google is unavailable.
 *
 * Google's mesh covers metros only. On a Pretoria - Cape Town route that is
 * roughly 300 km of the 1,582, so the streaming Esri terrain stays loaded
 * underneath and the tiles are shown only inside covered areas.
 *
 * REQUIRES: npm install 3d-tiles-renderer  (already in package.json)
 * NOT YET RUN against live tiles - the anchoring maths is the part most likely
 * to need adjusting, and `heightOffset` is the first dial to reach for.
 */

export const GOOGLE_TILES_KEY: string =
  (import.meta.env?.VITE_GOOGLE_MAPS_KEY as string | undefined)?.trim() ?? "";
export const CESIUM_ION_TOKEN: string =
  (import.meta.env?.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim() ?? "";

/** Cesium ion asset id for Cesium OSM Buildings. */
const CESIUM_OSM_BUILDINGS = 2275207;

/** Metro spans with Google photorealistic coverage, as route km. */
export const PHOTO_COVERAGE_KM: [number, number][] = [
  [0, 95],
  [545, 575],
  [1540, 1582],
];

export const hasPhotoCoverage = (km: number) =>
  PHOTO_COVERAGE_KM.some(([from, to]) => km >= from && km <= to);

export type TilesProvider = "google" | "cesium";

export interface PhotoTilesHandle {
  provider: TilesProvider;
  group: THREE.Group;
  /** Re-anchor after a floating-origin shift. */
  setOrigin(origin: LatLng, heightOffset?: number): void;
  update(): void;
  attributions(): string;
  dispose(): void;
}

export async function createPhotoTiles(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): Promise<PhotoTilesHandle | null> {
  if (!GOOGLE_TILES_KEY && !CESIUM_ION_TOKEN) return null;
  try {
    const core = await import("3d-tiles-renderer");
    const plugins = await import("3d-tiles-renderer/plugins");

    const attach = (provider: TilesProvider) => {
      const tiles = new core.TilesRenderer();
      if (provider === "google") {
        tiles.registerPlugin(
          new plugins.GoogleCloudAuthPlugin({ apiToken: GOOGLE_TILES_KEY, autoRefreshToken: true }),
        );
      } else {
        tiles.registerPlugin(
          new plugins.CesiumIonAuthPlugin({
            apiToken: CESIUM_ION_TOKEN,
            assetId: String(CESIUM_OSM_BUILDINGS),
            autoRefreshToken: true,
          }),
        );
      }
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, renderer);
      return tiles;
    };

    // Google first; it is the only one that is actually photorealistic.
    const provider: TilesProvider = GOOGLE_TILES_KEY ? "google" : "cesium";
    const tiles = attach(provider);

    const group = new THREE.Group();
    group.add(tiles.group);

    /**
     * Tile content is ECEF. This scene is a local metric frame: +x east, +y up,
     * -z north. An east-north-up frame at the origin composed with a +90 degree
     * X rotation - which maps local (x, y, z) to ENU (x, -z, y) - is the
     * transform from local to ECEF, so its inverse is what the group carries.
     */
    const localToEnu = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const frame = new THREE.Matrix4();

    const setOrigin = (origin: LatLng, heightOffset = 0) => {
      tiles.ellipsoid.getEastNorthUpFrame(
        THREE.MathUtils.degToRad(origin[0]),
        THREE.MathUtils.degToRad(origin[1]),
        heightOffset,
        frame,
      );
      tiles.group.matrixAutoUpdate = false;
      tiles.group.matrix.copy(frame).multiply(localToEnu).invert();
      tiles.group.matrix.decompose(tiles.group.position, tiles.group.quaternion, tiles.group.scale);
      tiles.group.updateMatrixWorld(true);
    };

    return {
      provider,
      group,
      setOrigin,
      update: () => tiles.update(),
      // Both providers require their attribution to be shown wherever tiles are.
      attributions: () => {
        try {
          return tiles
            .getAttributions()
            .map((entry: { value: string }) => entry.value)
            .join(" · ");
        } catch {
          return provider === "google" ? "Google" : "Cesium ion · OpenStreetMap";
        }
      },
      dispose: () => tiles.dispose(),
    };
  } catch (error) {
    console.warn(
      "[ShosholozaTrail] 3D Tiles unavailable (run: npm install) - staying on streaming terrain",
      error,
    );
    return null;
  }
}
