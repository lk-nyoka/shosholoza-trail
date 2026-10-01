// Real ground under the corridor.
//
// The scene stood on a flat 14 km plane, which is the last big lie in it:
// Pretoria sits in a valley between ridges, and Salvokop - the hill Freedom
// Park stands on - rises 60 m right beside the line. On flat ground every
// landmark looks like it is sitting on a table.
//
// Heights are baked by scripts/fetch-terrain.mjs from Mapzen terrarium tiles
// (AWS Open Data, keyless) into a 160x160 grid, about 60 m apart.
//
// The railway does NOT follow the ground. Real track is graded: the formation
// runs at a gentle, smoothed gradient while the land rolls underneath, and the
// difference shows as embankment or cutting. That is modelled here, because a
// line that follows every undulation is the single most obvious tell that a
// railway scene was made by someone who has not looked at one.
import * as THREE from 'three';
import { RailFormation } from './RailFormation.ts';

export type TerrainData = {
  grid: number;
  bounds: { west: number; east: number; south: number; north: number };
  minMetres: number;
  maxMetres: number;
  routeSampleStride: number;
  alongRoute: number[];
  heights: number[];
};

/** Metres of rail profile smoothing either side. Real grading is far longer. */
const GRADE_WINDOW = 5;

/**
 * A levelled pad for an authored landmark. Landmarks are built on a flat floor
 * in their own space, but the real ground under them varies by tens of metres,
 * so without this parts of them are buried and parts float. The terrain yields
 * instead: flat inside `inner`, blending back to the real ground by `outer`.
 * This is the usual game technique, and it means a landmark never has to know
 * about the terrain it sits on.
 */
export type TerrainStamp = {
  x: number; z: number; inner: number; outer: number;
  /** Floor level to level to. Defaults to the ground at the centre; a station
   *  platform wants rail level instead. */
  base?: number;
};

/**
 * The pad sits just below the landmark's own floor, so a landmark that brings
 * its own ground plane does not z-fight with the terrain beneath it.
 */
const PAD_SINK = 0.3;

/** Ground tint by height and slope. The default is Highveld grass. */
export type TerrainPalette = { valley: string; ridge: string; rock: string };

export class Terrain {
  /** Set before build() to tint a different landscape; Kimberley is red Kalahari sand, not grass. */
  palette: TerrainPalette = { valley: '#8fa05f', ridge: '#a79a6b', rock: '#8d8371' };
  private formation?: RailFormation;
  readonly datum: number;
  private data: TerrainData;
  private project: (lon: number, lat: number) => THREE.Vector3;
  private west: number; private east: number; private south: number; private north: number;
  private graded: number[];
  private corners?: { topLeft: THREE.Vector3; bottomRight: THREE.Vector3 };
  private sampleSpacing: number;

  /**
   * @param project      Scene projection, so the grid can be placed in world space.
   * @param routeLength  Length of the animation slice in metres.
   */
  constructor(data: TerrainData, project: (lon: number, lat: number) => THREE.Vector3, routeLength: number) {
    // Stamps rewrite heights, so work on a copy rather than the loaded data.
    this.data = { ...data, heights: [...data.heights] };
    this.project = project;
    ({ west: this.west, east: this.east, south: this.south, north: this.north } = data.bounds);
    // Ground zero is where the train starts, so the scene works in local metres
    // instead of 1 300 m above sea level.
    this.datum = data.alongRoute[0] ?? 0;
    this.sampleSpacing = routeLength / Math.max(1, data.alongRoute.length - 1);
    this.graded = Terrain.grade(data.alongRoute, this.datum);
  }

  /** Smooth the along-route profile into something a train could actually climb. */
  private static grade(samples: number[], datum: number) {
    const out: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      let total = 0, count = 0;
      for (let k = -GRADE_WINDOW; k <= GRADE_WINDOW; k++) {
        const index = Math.min(samples.length - 1, Math.max(0, i + k));
        total += samples[index];
        count++;
      }
      out.push(total / count - datum);
    }
    return out;
  }

  /** Rail level at a route position, in scene metres above the datum. */
  railAt(distance: number) {
    const position = distance / this.sampleSpacing;
    const low = Math.max(0, Math.min(this.graded.length - 1, Math.floor(position)));
    const high = Math.max(0, Math.min(this.graded.length - 1, low + 1));
    const t = Math.max(0, Math.min(1, position - low));
    return THREE.MathUtils.lerp(this.graded[low], this.graded[high], t);
  }

  /**
   * Level the ground under a landmark. Must be called before build(). Returns
   * the pad level, which is where the landmark's own floor should sit.
   *
   * The grid itself is rewritten rather than the sampler, so the mesh and
   * heightAt() cannot disagree - everything placed with groundAt (trees, roads,
   * buildings, grass) conforms to the pad automatically.
   */
  addStamp(stamp: TerrainStamp) {
    const base = stamp.base ?? this.heightAt(stamp.x, stamp.z);
    const pad = base - PAD_SINK;
    const { grid, heights } = this.data;
    const topLeft = this.project(this.west, this.north);
    const bottomRight = this.project(this.east, this.south);
    for (let row = 0; row < grid; row++) {
      const z = topLeft.z + (bottomRight.z - topLeft.z) * (row / (grid - 1));
      for (let column = 0; column < grid; column++) {
        const x = topLeft.x + (bottomRight.x - topLeft.x) * (column / (grid - 1));
        const distance = Math.hypot(x - stamp.x, z - stamp.z);
        if (distance >= stamp.outer) continue;
        const t = THREE.MathUtils.smoothstep(distance, stamp.inner, stamp.outer);
        const index = row * grid + column;
        // Stored heights include the datum; the pad is in scene metres.
        heights[index] = THREE.MathUtils.lerp(pad + this.datum, heights[index], t);
      }
    }
    return base;
  }

  /**
   * Drop the ground inside `radius` to `floor` (scene metres), for an authored
   * pit such as Kimberley's Big Hole. A 25 m DEM smooths a vertical-walled mine
   * into a gentle bowl; the pit brings its own walls, and the terrain only has
   * to get out of the way. Must be called before build().
   */
  addPit(pit: { x: number; z: number; radius: number; floor: number }) {
    const { grid, heights } = this.data;
    const topLeft = this.project(this.west, this.north);
    const bottomRight = this.project(this.east, this.south);
    for (let row = 0; row < grid; row++) {
      const z = topLeft.z + (bottomRight.z - topLeft.z) * (row / (grid - 1));
      for (let column = 0; column < grid; column++) {
        const x = topLeft.x + (bottomRight.x - topLeft.x) * (column / (grid - 1));
        if (Math.hypot(x - pit.x, z - pit.z) < pit.radius) heights[row * grid + column] = pit.floor + this.datum;
      }
    }
  }

  /** Call after landmark/station pads, before scenery reads ground heights. */
  carveRail(project: (s: number) => THREE.Vector3, from: number, to: number) {
    this.formation = new RailFormation(project, from, to);
  }

  /** Ground level from the same carved surface used by the terrain mesh. */
  heightAt(x: number, z: number) {
    const original = this.rawHeightAt(x, z);
    return this.formation?.heightAt(x, z, original) ?? original;
  }

  private rawHeightAt(x: number, z: number) {
    const { grid, heights } = this.data;
    // Invert the projection back to a grid cell. The grid is regular in
    // lon/lat, and the projection is linear, so this is a plain remap.
    // Corners are projected once: this runs hundreds of times a frame.
    this.corners ??= { topLeft: this.project(this.west, this.north), bottomRight: this.project(this.east, this.south) };
    const { topLeft, bottomRight } = this.corners;
    const u = (x - topLeft.x) / (bottomRight.x - topLeft.x || 1);
    const v = (z - topLeft.z) / (bottomRight.z - topLeft.z || 1);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const column = u * (grid - 1), row = v * (grid - 1);
    const c0 = Math.floor(column), r0 = Math.floor(row);
    const c1 = Math.min(grid - 1, c0 + 1), r1 = Math.min(grid - 1, r0 + 1);
    const fx = column - c0, fy = row - r0;
    const at = (r: number, c: number) => heights[r * grid + c] - this.datum;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(at(r0, c0), at(r0, c1), fx),
      THREE.MathUtils.lerp(at(r1, c0), at(r1, c1), fx),
      fy,
    );
  }

  /** The ground mesh. One draw call for the whole corridor. */
  build(material: THREE.Material) {
    const { grid } = this.data;
    const topLeft = this.project(this.west, this.north);
    const bottomRight = this.project(this.east, this.south);
    const width = bottomRight.x - topLeft.x;
    const depth = bottomRight.z - topLeft.z;

    const geometry: THREE.BufferGeometry = this.formation
      ? this.corridorGeometry(topLeft, bottomRight)
      : new THREE.PlaneGeometry(Math.abs(width), Math.abs(depth), grid - 1, grid - 1);
    if (!this.formation) {
    geometry.rotateX(-Math.PI / 2);
    }
    const position = geometry.attributes.position as THREE.BufferAttribute;
    // PlaneGeometry after rotateX runs +x east and +z south, matching the grid's
    // row/column order, so vertices map straight onto samples.
    for (let i = 0; !this.formation && i < position.count; i++) {
      const row = Math.floor(i / grid), column = i % grid;
      position.setY(i, this.data.heights[row * grid + column] - this.datum);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    // Tint by height and slope. A single flat green hides the relief entirely -
    // the landform is only visible through shading, and at midday there is
    // barely any. Highveld grass in the valleys, dry ridges, rock where it is
    // steep enough that nothing holds.
    const normal = geometry.attributes.normal as THREE.BufferAttribute;
    const colours = new Float32Array(position.count * 3);
    const valley = new THREE.Color(this.palette.valley);
    const ridge = new THREE.Color(this.palette.ridge);
    const rock = new THREE.Color(this.palette.rock);
    const scratch = new THREE.Color();
    const span = (this.data.maxMetres - this.data.minMetres) || 1;
    for (let i = 0; i < position.count; i++) {
      const height = (position.getY(i) + this.datum - this.data.minMetres) / span;
      // Normal.y is 1 on the flat and falls off as the ground tilts.
      const steep = 1 - Math.min(1, Math.max(0, normal.getY(i)));
      scratch.copy(valley).lerp(ridge, THREE.MathUtils.smoothstep(height, 0.15, 0.8));
      scratch.lerp(rock, THREE.MathUtils.smoothstep(steep, 0.12, 0.45));
      colours[i * 3] = scratch.r; colours[i * 3 + 1] = scratch.g; colours[i * 3 + 2] = scratch.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    if (!this.formation) geometry.translate((topLeft.x + bottomRight.x) / 2, 0, (topLeft.z + bottomRight.z) / 2);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Refine only cells near the railway; a 60 m DEM cannot resolve a cutting. */
  private corridorGeometry(a: THREE.Vector3, b: THREE.Vector3) {
    const positions: number[] = [], indices: number[] = [];
    const cells = this.data.grid - 1, dx = (b.x - a.x) / cells, dz = (b.z - a.z) / cells;
    const diagonal = Math.hypot(dx, dz);
    for (let row = 0; row < cells; row++) for (let col = 0; col < cells; col++) {
      const x0 = a.x + col * dx, z0 = a.z + row * dz;
      // Test corners and centre: bucket queries deliberately have a bounded radius.
      const near = [[0, 0], [1, 0], [0, 1], [1, 1], [.5, .5]].some(([u, v]) =>
        this.formation!.sample(x0 + dx * u, z0 + dz * v).distance < this.formation!.outer + diagonal);
      const n = near ? Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 12)) : 1;
      const start = positions.length / 3;
      for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
        const x = x0 + dx * c / n, z = z0 + dz * r / n;
        positions.push(x, this.heightAt(x, z), z);
      }
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const i = start + r * (n + 1) + c;
        indices.push(i, i + n + 1, i + 1, i + 1, i + n + 1, i + n + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  /**
   * The railway formation: a ribbon from ground level up to rail level, which
   * is embankment where the land falls away and cutting where it rises.
   */
  buildFormation(
    route: { project(distance: number): THREE.Vector3; basis(distance: number): THREE.Vector3 },
    fromMetres: number,
    toMetres: number,
    material: THREE.Material,
    step = 14,
    halfWidth = 6.5,
  ) {
    const positions: number[] = [];
    const push = (v: THREE.Vector3) => positions.push(v.x, v.y, v.z);

    for (let s = fromMetres; s < toMetres; s += step) {
      const a = route.project(s), b = route.project(s + step);
      const fa = route.basis(s), fb = route.basis(s + step);
      const sa = new THREE.Vector3(-fa.z, 0, fa.x).normalize();
      const sb = new THREE.Vector3(-fb.z, 0, fb.x).normalize();

      for (const side of [-1, 1]) {
        // Top edge at rail level, bottom edge on the ground below it.
        const topA = a.clone().addScaledVector(sa, side * halfWidth);
        const topB = b.clone().addScaledVector(sb, side * halfWidth);
        // The batter slopes out as the drop grows, roughly 1.5:1.
        const dropA = topA.y - this.heightAt(topA.x, topA.z);
        const dropB = topB.y - this.heightAt(topB.x, topB.z);
        const footA = topA.clone().addScaledVector(sa, side * Math.abs(dropA) * 1.5).setY(topA.y - dropA);
        const footB = topB.clone().addScaledVector(sb, side * Math.abs(dropB) * 1.5).setY(topB.y - dropB);

        // Wind each quad so its face points away from the track. The two sides
        // are mirror images, so they need opposite winding; getting this the
        // wrong way round makes both batters face inward, and a FrontSide
        // material then culls the whole formation from every normal viewpoint.
        if (side < 0) { push(topA); push(topB); push(footA); push(footA); push(topB); push(footB); }
        else { push(topA); push(footA); push(topB); push(topB); push(footA); push(footB); }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }
}
