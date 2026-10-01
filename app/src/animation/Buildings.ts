// Real Pretoria building footprints, extruded.
//
// These replace 95 randomly sized boxes. Random boxes are the generic city the
// plan warns against - the same scene would serve Johannesburg, or Ohio. These
// are the actual buildings beside the line out of Pretoria: the station sheds,
// the Salvokop houses, the industrial blocks along the Berea Park side.
//
// Data comes from OpenStreetMap via scripts/fetch-osm-buildings.mjs, fetched at
// build time and shipped as a local file, so the page makes no network request
// for it. ODbL 1.0; attribution is in the page credits.
//
// Every footprint is extruded and then merged into one geometry per colour, so
// 531 buildings cost three draw calls rather than 531.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type BuildingRecord = {
  lon: number;
  lat: number;
  height: number;
  away: number;
  /** Footprint in metres, relative to the building's own centroid. */
  ring: [number, number][];
};

export type BuildingData = { count: number; source: string; buildings: BuildingRecord[] };

/** Warm plaster, pale concrete, face brick - the palette of the corridor. */
const PALETTE = ['#d6c5a8', '#c2bda9', '#b2846a'];

/**
 * Procedural window texture, after threex.proceduralcity (MIT, Jerome Etienne,
 * after mrdoob), `generateTextureCanvas()`. Rows of 2x1 rectangles at random
 * brightness are painted on a 32x64 canvas, then upscaled to 512x1024 with
 * smoothing off so the windows stay crisp instead of blurring into a haze.
 * That last step is the whole trick.
 *
 * Used as an emissiveMap, so it is invisible by day and lights the buildings
 * from within at night. See public/licenses/threex-proceduralcity-MIT.txt.
 */
function windowTexture(): THREE.CanvasTexture {
  const small = document.createElement('canvas');
  small.width = 32; small.height = 64;
  const context = small.getContext('2d')!;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, 32, 64);
  for (let y = 2; y < 64; y += 2) {
    for (let x = 0; x < 32; x += 2) {
      // Most windows are dark; a minority are lit, and those vary.
      const lit = Math.random() > 0.62;
      const value = lit ? 140 + Math.floor(Math.random() * 115) : Math.floor(Math.random() * 22);
      context.fillStyle = `rgb(${value},${Math.round(value * 0.92)},${Math.round(value * 0.74)})`;
      context.fillRect(x, y, 2, 1);
    }
  }
  const large = document.createElement('canvas');
  large.width = 512; large.height = 1024;
  const big = large.getContext('2d')!;
  big.imageSmoothingEnabled = false;
  big.drawImage(small, 0, 0, large.width, large.height);

  const texture = new THREE.CanvasTexture(large);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // ExtrudeGeometry's side-wall UVs are in metres, so one repeat every few
  // metres puts windows at roughly storey spacing.
  texture.repeat.set(0.24, 0.24);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

export type BuiltCity = {
  meshes: THREE.Mesh[];
  extruded: number;
  dispose(): void;
};

export function createBuildings(
  data: BuildingData,
  project: (lon: number, lat: number) => THREE.Vector3,
  /** Called with each wall material so the time-of-day system can light it. */
  registerEmissive: (material: THREE.MeshStandardMaterial, colour: string, peak: number) => void,
): BuiltCity {
  const buckets: THREE.BufferGeometry[][] = PALETTE.map(() => []);
  let extruded = 0;

  data.buildings.forEach((building, index) => {
    if (building.ring.length < 3) return;

    const shape = new THREE.Shape();
    // The ring is (east, north) in metres. Built in the shape's XY plane, then
    // laid flat: ExtrudeGeometry always extrudes along +Z.
    shape.moveTo(building.ring[0][0], building.ring[0][1]);
    for (let i = 1; i < building.ring.length; i++) shape.lineTo(building.ring[i][0], building.ring[i][1]);
    shape.closePath();

    let geometry: THREE.ExtrudeGeometry;
    try {
      geometry = new THREE.ExtrudeGeometry(shape, { depth: building.height, bevelEnabled: false, curveSegments: 1 });
    } catch {
      // A self-intersecting footprint can fail triangulation. One bad building
      // must not cost the city.
      return;
    }
    geometry.rotateX(-Math.PI / 2);
    // After the rotation the footprint's north axis points at -Z, which matches
    // how the rest of the scene projects latitude.
    const at = project(building.lon, building.lat);
    geometry.translate(at.x, at.y, at.z);

    buckets[index % PALETTE.length].push(geometry);
    extruded++;
  });

  const texture = windowTexture();
  const materials: THREE.MeshStandardMaterial[] = [];
  const meshes: THREE.Mesh[] = [];
  buckets.forEach((group, index) => {
    if (!group.length) return;
    const merged = mergeGeometries(group, false);
    for (const geometry of group) geometry.dispose();
    if (!merged) return;
    merged.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: PALETTE[index], roughness: 0.92,
      emissiveMap: texture, emissive: new THREE.Color('#000000'), emissiveIntensity: 0,
    });
    registerEmissive(material, '#ffd9a0', 1.9);
    materials.push(material);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  });

  return {
    meshes,
    extruded,
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const material of materials) material.dispose();
      texture.dispose();
    },
  };
}
