import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { Stop, LatLng } from "../../types";
import { M_PER_DEG_LAT, fromLocalMetres, toLocalMetres } from "../../lib/geoTiles";
import {
  CAR_LENGTH_M,
  CAR_PITCH_M,
  TerrainStreamer,
  createBallastRibbon,
  createCatenary,
  createCommuterTrain,
  createBillboard,
  createPlaceMarker,
  createBuildings,
  createFoliageTexture,
  createTreeBelt,
  smoothPolyline,
  TRACK_CLEARANCE_M,
  brunnelRuns,
  createBridgeDecks,
  createTunnelPortals,
  fetchBuildingsFromTiles,
  fetchRoadsFromTiles,
  createRoads,
  type BrunnelKind,
  vegetationAtKm,
  type VegetationKind,
} from "../../lib/railWorld";
import { LANDMARKS, billboardOpacity } from "../../lib/landmarks";
import { placesNear, type Place } from "../../lib/places";
import { TOTAL_KM, positionAt, brunnelAtKm } from "../../lib/routeIndex";
import "./TrainMap.css";

const TRAIN_ASSET_PATH = "/assets/train.glb";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The scene is metric: one world unit is one metre. */
const WINDOW_KM = 6; // route built either side of the train at 1x
/**
 * Metres between route samples, by playback speed. At 1x this is the geometry
 * the rider is looking at, so it stays fine. At 16x the train covers 4 km every
 * second and the window is tens of kilometres long: sampling that at 25 m built
 * five thousand rail segments, a couple of thousand catenary spans and a
 * Catmull-Rom curve over the lot, every rebuild - several hundred milliseconds
 * of main thread in one lump, which is the hitch. Nothing at that speed is
 * legible at 25 m anyway.
 */
const sampleStepM = (speed: number) => (speed <= 1 ? 25 : speed <= 4 ? 45 : 110);
const WINDOW_SAMPLE_M = 25;
/**
 * How far the corridor is built either side of the train, and how far it may
 * travel before that is rebuilt.
 *
 * Both used to grow without limit with playback speed - a 64 km window at 16x,
 * rebuilt every 19 km. Each rebuild was then enormous and rare, which is the
 * worst of both: a long stall, and in between it the train ran to the very edge
 * of what had been built. The window is capped and the rebuild threshold is a
 * fixed fraction of it, so rebuilds are small, regular, and always leave most
 * of a window in hand.
 */
const windowDistanceKm = (speed: number) => clamp(4 * speed, WINDOW_KM, 20);
const rebuildDistanceKm = (speed: number) => windowDistanceKm(speed) * 0.45;
/**
 * How far the train may travel before the imagery rings are re-centred. The
 * sharp ring is about 700 m across, so anything much over a third of that and
 * the train is looking at ground the ring no longer covers.
 */
const terrainStepKm = (speed: number) => (speed <= 1 ? 0.22 : speed <= 4 ? 0.7 : 2.5);
const LABEL_RANGE_M = 9000;
/**
 * Fog has to end before the terrain does, or you see the edge of the world - but
 * no sooner, or it eats the view.
 *
 * At 4.6-9 km it was eating the view. The Tulbagh valley is ringed by mountains
 * eight kilometres out and fifteen hundred metres high, and at that setting they
 * were ninety-odd percent fogged - indistinguishable from sky, so the Cape came
 * out as a flat green plain with nothing on the horizon. The coarse ring reaches
 * thirteen kilometres and the backdrop plane covers everything past it, so fog
 * can start well beyond the mountains and still hide the seam.
 */
const FOG_NEAR = 8000;
const FOG_FAR = 20000;
/** Sunk far enough below the train that real terrain never pokes through it. */
const BACKDROP_DROP_M = 280;
const CAR_COUNT = 6;
const TRAIN_LENGTH_M = CAR_COUNT * CAR_PITCH_M;
/**
 * The consist occupies real track behind the cab, so the cab can never sit at
 * km 0 - the rear carriages would be placed before the route even begins.
 * pointAtKm extrapolates in a straight line off the ends, and the line out of
 * Pretoria curves, so the tail swung off the rails and onto the grass. Holding
 * the cab at least a train-length in keeps every carriage on mapped track.
 */
const TRAIN_LENGTH_KM = TRAIN_LENGTH_M / 1000;
/**
 * Third-person chase pose, measured from the LEAD car.
 *
 * The consist is six cars - about 142 m - and the camera sits BEHIND all of it,
 * so the offset has to clear the whole train and then some. At 112 m back and
 * 16 m up the camera was level with the roof of the last carriage: the train
 * filled the frame end to end and there was no landscape left to see. Behind the
 * tail and well above it, the whole set reads against the line ahead.
 */
/**
 * Measured over the whole route, not guessed.
 *
 * I sampled the elevation model every hundred metres for all 1,568 km and
 * checked, at each one, whether the ground between the camera and the train
 * breaks the sight line. At 200 m behind the cab there are 28 places where it
 * does - almost all of them in the Hex River pass between 53 and 31 km short of
 * Worcester, which is exactly where the train was disappearing. Pulling the
 * camera in is far more effective than lifting it: the closer it sits, the less
 * ground there is between it and the train to get in the way. Framing on the
 * middle of the consist rather than the cab helps again, because the cab is the
 * furthest part and the last to clear a brow.
 *
 * Back far enough to clear the tail and no further, aimed at the middle: four
 * blocked samples left in 15,684, and the adaptive lift below handles those.
 */
const CHASE_BACK_M = TRAIN_LENGTH_M + 45;
const CHASE_UP_M = 34;
/** The camera frames the middle of the train, not its nose. */
const CHASE_AIM_BACK_M = TRAIN_LENGTH_M * 0.5;
const LOOK_AHEAD_KM_AT_ONE_X = 0.25;

const radians = (value: number) => (value * Math.PI) / 180;

interface Props {
  km: number;
  follow: boolean;
  firstPerson?: boolean;
  speed?: number;
  playing?: boolean;
  viewYaw?: number;
  viewPitch?: number;
  activeStop: Stop;
  stops: Stop[];
  onStopClick: (stop: Stop) => void;
  className?: string;
}

export default function TrainMap({
  km,
  follow,
  firstPerson = false,
  speed = 1,
  playing = false,
  viewYaw = 0,
  viewPitch = 0,
  activeStop,
  stops,
  onStopClick,
  className = "",
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ km, follow, firstPerson, speed, playing, viewYaw, viewPitch, activeStop, stops, onStopClick });
  stateRef.current = { km, follow, firstPerson, speed, playing, viewYaw, viewPitch, activeStop, stops, onStopClick };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      mount.classList.add("st-webgl-map--unsupported");
      mount.innerHTML = `<div class="st-webgl-fallback" aria-label="Animated rail corridor preview">
        <div class="st-webgl-fallback__sky"></div>
        <div class="st-webgl-fallback__horizon"><span>PRETORIA</span><span>JOHANNESBURG</span><span>KIMBERLEY</span><span>BEAUFORT WEST</span><span>CAPE TOWN</span></div>
        <div class="st-webgl-fallback__track"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="st-webgl-fallback__train"><b></b><b></b><b></b></div>
        <div class="st-webgl-fallback__caption"><strong>Shosholoza Star</strong><span>Pretoria to Cape Town &middot; corridor preview</span></div>
      </div>`;
      const train = mount.querySelector<HTMLElement>(".st-webgl-fallback__train");
      let fallbackFrame = 0;
      const animateFallback = () => {
        fallbackFrame = requestAnimationFrame(animateFallback);
        if (!train) return;
        const progress = clamp(stateRef.current.km / TOTAL_KM, 0, 1);
        train.style.left = `${8 + progress * 84}%`;
        train.style.transform = `translate(-50%, -50%) rotate(${progress > 0.45 ? 2 : -2}deg)`;
      };
      animateFallback();
      return () => {
        cancelAnimationFrame(fallbackFrame);
        mount.innerHTML = "";
      };
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // A touch up from 0.95. The Cape mountains sit in their own shadow for most
    // of the day and were coming out almost black.
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const horizon = new THREE.Color(0xbcc9d6);
    scene.background = horizon;
    scene.fog = new THREE.Fog(horizon, FOG_NEAR, FOG_FAR);
    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.6, 20000);

    /**
     * Rendering straight to the screen, no EffectComposer.
     *
     * The chain that was added here rendered the scene pure black - measured:
     * 61 imagery tiles loaded, GL context alive, canvas brightness 0. SSAO over
     * a 0.6-to-20000 depth range cannot produce a sane occlusion term, and the
     * bloom pass on top was the "added brightness" over what is already a fully
     * lit photograph.
     *
     * It is also the honest answer on performance: SSAO at full resolution was
     * the most expensive thing in the frame. Contact shadow would be nice, but
     * not at the cost of a black screen and a stuttering ride. Worth revisiting
     * with a cheaper AO (N8AO or GTAOPass) once the scene itself is settled.
     */
    /**
     * Sky fill, and it has to be a real one.
     *
     * The ground half of this was a dark brown at 0.6 - so any surface facing
     * away from the sun got almost nothing, and the building walls came out
     * near-black. Over a city that is the whole skyline rendered as flat dark
     * polygons, which is most of what "the graphics are bad" was. A bright sky
     * above and a warm pale bounce below is what open ground actually does to a
     * wall, and the sun comes down a little to compensate.
     *
     * This is fill light, not the bloom pass that was added and removed here
     * before: nothing is being brightened past what it should be.
     */
    scene.add(new THREE.HemisphereLight(0xbcd8f2, 0x9c9482, 1.15));
    const sun = new THREE.DirectionalLight(0xfff5ea, 1.45);
    sun.position.set(-320, 520, 280);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 50;
    sun.shadow.camera.far = 2200;
    const shadowExtent = 320;
    sun.shadow.camera.left = -shadowExtent;
    sun.shadow.camera.right = shadowExtent;
    sun.shadow.camera.top = shadowExtent;
    sun.shadow.camera.bottom = -shadowExtent;
    sun.shadow.bias = -0.0001;
    scene.add(sun);
    scene.add(sun.target);

    const sky = new Sky();
    sky.scale.setScalar(18000);
    sky.material.uniforms.turbidity.value = 6;
    sky.material.uniforms.rayleigh.value = 1.4;
    sky.material.uniforms.mieCoefficient.value = 0.006;
    sky.material.uniforms.mieDirectionalG.value = 0.8;
    sky.material.uniforms.sunPosition.value.copy(sun.position).normalize();
    scene.add(sky);

    // ── World state, all in the local metric frame ──────────────────────────
    let origin: LatLng = positionAt(0);
    const terrain = new TerrainStreamer(origin);
    terrain.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
    scene.add(terrain.group);

    /**
     * Land under everything, out past the last tile.
     *
     * The streamer covers a few kilometres and then stops, and what was behind
     * it was scene.background - a pale grey that reads as a hole in the world
     * wherever a tile is missing or the ring runs out. A single fogged plane
     * follows the train underneath the terrain, so a gap shows distant ground
     * hazing into the horizon instead of white.
     */
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(80000, 80000),
      new THREE.MeshBasicMaterial({ color: 0x8a8a6e, depthWrite: false }),
    );
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.renderOrder = -1;
    scene.add(backdrop);

    const corridor = new THREE.Group();
    scene.add(corridor);

    // GOOGLE PHOTOREALISTIC 3D TILES - see src/lib/googleTiles.ts.
    // Deliberately not imported yet: Vite resolves imports at transform time, so
    // referencing it before `npm install` takes the whole ride page down. After
    // installing, restore the four marked lines (the file documents them).

    // One material per vegetation kind, built on demand as the train moves
    // between regions, so the Karoo does not get Pretoria's jacarandas.
    const foliageMaterials = new Map<VegetationKind, THREE.MeshStandardMaterial>();
    const foliageMaterialFor = (kind: VegetationKind) => {
      const existing = foliageMaterials.get(kind);
      if (existing) return existing;
      const material = new THREE.MeshStandardMaterial({
        map: createFoliageTexture(kind),
        transparent: true,
        alphaTest: 0.42,
        side: THREE.DoubleSide,
        roughness: 0.92,
        opacity: 0,
        depthWrite: false,
      });
      foliageMaterials.set(kind, material);
      return material;
    };

    const billboards = LANDMARKS.map(landmark => ({ landmark, ...createBillboard(landmark.name) }));
    for (const entry of billboards) scene.add(entry.sprite);

    /**
     * Every place on the line can get a name in the landscape, not just the
     * eight scheduled stops - but only a few are ever on screen, so these are a
     * pool of six markers reassigned as the train moves rather than one sprite
     * per place.
     */
    /**
     * Thin the label list so names do not print through one another.
     *
     * Around Pretoria the route passes Muckleneuk, Sunnyside and Trevenna
     * within a few hundred metres of each other, and all three drew their names
     * at the same spot — the screen read "MUOKLENUKNNYSIDE". Labels are placed
     * along the route and offset to one side, so two places on the same side
     * within about a kilometre will always collide; the nearer one wins and the
     * others wait their turn.
     */
    const MIN_LABEL_GAP_KM = 1.1;
    const thinLabels = (places: Place[], limit: number): Place[] => {
      const takenLeft: number[] = [];
      const takenRight: number[] = [];
      const kept: Place[] = [];
      for (const place of places) {
        const taken = place.side === "left" ? takenLeft : takenRight;
        if (taken.some(km => Math.abs(km - place.km) < MIN_LABEL_GAP_KM)) continue;
        taken.push(place.km);
        kept.push(place);
        if (kept.length === limit) break;
      }
      return kept;
    };

    const placeMarkers = Array.from({ length: 6 }, () => createPlaceMarker());
    for (const marker of placeMarkers) scene.add(marker.sprite);
    let visiblePlaces: Place[] = [];
    let placesKey = -1;

    let stepKm = WINDOW_SAMPLE_M / 1000;
    let windowStartKm = -1;
    let windowEndKm = -1;
    /** Route samples, uniformly spaced in km - the index IS the distance. */
    let windowPoints: THREE.Vector3[] = [];
    /**
     * Distance in real metres from the start of the window to each sample.
     *
     * Route km and metres along the BUILT line are not the same number. The
     * samples are uniform in route km, then smoothed, and smoothing shortens a
     * curve - so twenty-three metres of route km is twenty-two-and-a-bit metres
     * of actual track through a bend and a full twenty-three down a straight.
     * Spacing the carriages by route km therefore opened and closed the gaps
     * between them as the curvature changed, which is what "the train is
     * detaching" was. On the Gautrain alignment out of Pretoria, which bends
     * constantly, it is at its worst - hence the first twenty kilometres.
     */
    let windowChord: number[] = [];
    let rollSamples: number[] = [];
    let buildingsGroup: THREE.Group | null = null;
    let roadsGroup: THREE.Group | null = null;
    let buildingsController: AbortController | null = null;
    let buildingsKey = "";

    /**
     * Direct lookup into the uniform sample array. CatmullRomCurve3.getPointAt
     * was used here, but it reparameterises by arc length from a 200-entry table
     * regardless of control-point count - with ~480 points the km-to-position
     * mapping drifted unevenly, which is what tore the carriages apart.
     */
    const pointAtKm = (target: number, out = new THREE.Vector3()) => {
      if (!windowPoints.length) return out.set(0, 0, 0);
      const raw = (target - windowStartKm) / stepKm;
      /**
       * Extrapolate off the ends instead of clamping. Clamping stacked every
       * carriage on the same point at the start of the route, so the set
       * telescoped into itself and looked like it had come apart.
       */
      if (raw < 0) {
        return out.copy(windowPoints[0]).addScaledVector(
          new THREE.Vector3().subVectors(windowPoints[0], windowPoints[1]),
          -raw,
        );
      }
      const last = windowPoints.length - 1;
      if (raw > last) {
        return out.copy(windowPoints[last]).addScaledVector(
          new THREE.Vector3().subVectors(windowPoints[last], windowPoints[last - 1]),
          raw - last,
        );
      }
      const start = Math.floor(raw);
      const end = Math.min(start + 1, last);
      return out.copy(windowPoints[start]).lerp(windowPoints[end], raw - start);
    };

    /** Metres along the built line at a route distance. */
    const chordAtKm = (target: number) => {
      if (windowChord.length < 2) return 0;
      const raw = clamp((target - windowStartKm) / stepKm, 0, windowChord.length - 1);
      const start = Math.floor(raw);
      const end = Math.min(start + 1, windowChord.length - 1);
      return windowChord[start] + (windowChord[end] - windowChord[start]) * (raw - start);
    };

    /**
     * A point a true number of metres back along the line from the cab. This is
     * what the carriages are hung from, so the coupling gaps are fixed by
     * construction no matter how tight the curve.
     */
    const pointAtChord = (distance: number, out = new THREE.Vector3()) => {
      const last = windowChord.length - 1;
      if (last < 1) return out.set(0, 0, 0);
      if (distance <= 0) {
        const overshoot = -distance;
        const step = Math.max(0.001, windowChord[1]);
        return out
          .copy(windowPoints[0])
          .addScaledVector(
            new THREE.Vector3().subVectors(windowPoints[0], windowPoints[1]).divideScalar(step),
            overshoot,
          );
      }
      if (distance >= windowChord[last]) {
        const overshoot = distance - windowChord[last];
        const step = Math.max(0.001, windowChord[last] - windowChord[last - 1]);
        return out
          .copy(windowPoints[last])
          .addScaledVector(
            new THREE.Vector3().subVectors(windowPoints[last], windowPoints[last - 1]).divideScalar(step),
            overshoot,
          );
      }
      let low = 0;
      let high = last;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (windowChord[middle] < distance) low = middle + 1;
        else high = middle;
      }
      const end = Math.max(1, low);
      const start = end - 1;
      const span = windowChord[end] - windowChord[start];
      const t = span ? (distance - windowChord[start]) / span : 0;
      return out.copy(windowPoints[start]).lerp(windowPoints[end], t);
    };

    /** Route km at a given distance along the built line - for roll and brunnel lookups. */
    const kmAtChord = (distance: number) => {
      const last = windowChord.length - 1;
      if (last < 1) return windowStartKm;
      const clamped = clamp(distance, 0, windowChord[last]);
      let low = 0;
      let high = last;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (windowChord[middle] < clamped) low = middle + 1;
        else high = middle;
      }
      const end = Math.max(1, low);
      const start = end - 1;
      const span = windowChord[end] - windowChord[start];
      const t = span ? (clamped - windowChord[start]) / span : 0;
      return windowStartKm + (start + t) * stepKm;
    };

    const rollAtKm = (target: number) => {
      if (!rollSamples.length) return 0;
      const at = clamp((target - windowStartKm) / stepKm, 0, rollSamples.length - 1);
      const start = Math.floor(at);
      const end = Math.min(start + 1, rollSamples.length - 1);
      return rollSamples[start] + (rollSamples[end] - rollSamples[start]) * (at - start);
    };

    const rebuildCorridor = (centreKm: number) => {
      const speed = stateRef.current.speed;
      stepKm = sampleStepM(speed) / 1000;
      const reach = windowDistanceKm(speed);
      windowStartKm = Math.max(0, centreKm - reach);
      windowEndKm = Math.min(TOTAL_KM, centreKm + reach);
      const points: THREE.Vector3[] = [];
      const latLngs: LatLng[] = [];
      const groundY: number[] = [];
      const brunnel: BrunnelKind[] = [];
      /**
       * Never let a missing elevation tile put the track at sea level.
       *
       * heightAt() answers 0 for any point whose DEM tile has not loaded, and 0
       * is the sea. On a line that runs at 1,300 m through the Highveld that is
       * a kilometre and a third straight down: the rail vanished into the
       * ground, the train went under the terrain, and the buildings - which are
       * placed on real elevation - ended up beneath its wheels. recentre() now
       * loads the DEM along this window before we get here, but a tile can
       * still fail, so carry the last known height forward rather than falling
       * off the planet.
       */
      let lastKnownGround: number | null = null;

      /**
       * The HIGHEST ground within about twenty metres, not the ground at a
       * point.
       *
       * The terrain mesh takes its height from the same model, but at its own
       * vertices - roughly one every eleven metres on the near ring - and then
       * interpolates between them. On any slope the mesh between two vertices
       * sits higher than the model reads at the single point the track sampled,
       * and thirty-five centimetres of clearance is nowhere near enough to
       * survive that. The line sank into the hillside, which is what
       * "underground in Johannesburg" is: the ground rises across the city and
       * the track was being laid to point samples on it.
       *
       * Taking the local maximum and standing the formation nearly a metre over
       * it is also just what a railway is - built up on a bank, not painted on
       * the veld.
       */
      const FORMATION_M = 0.9;
      const groundNear = (latLng: LatLng) => {
        const dLat = 20 / M_PER_DEG_LAT;
        const dLon = 20 / (M_PER_DEG_LAT * Math.cos((latLng[0] * Math.PI) / 180));
        let highest = -Infinity;
        for (const [oLat, oLon] of [
          [0, 0],
          [dLat, 0],
          [-dLat, 0],
          [0, dLon],
          [0, -dLon],
        ]) {
          if (!terrain.elevation.hasCoverage(latLng[0] + oLat, latLng[1] + oLon)) continue;
          highest = Math.max(highest, terrain.elevation.heightAt(latLng[0] + oLat, latLng[1] + oLon));
        }
        return Number.isFinite(highest) ? highest : null;
      };

      for (let at = windowStartKm; at <= windowEndKm + 1e-6; at += stepKm) {
        const latLng = positionAt(at);
        const local = toLocalMetres(latLng, origin);
        const sampled = groundNear(latLng);
        const ground = sampled ?? lastKnownGround ?? 0;
        if (sampled !== null) lastKnownGround = sampled;
        points.push(new THREE.Vector3(local.x, ground + FORMATION_M, local.z));
        latLngs.push(latLng);
        groundY.push(ground);
        brunnel.push(brunnelAtKm(at));
      }

      /**
       * Backfill the head of the window. If the first samples had no coverage
       * they took 0 above, because there was no earlier height to inherit yet.
       */
      if (lastKnownGround !== null) {
        for (let index = 0; index < points.length; index += 1) {
          if (groundY[index] !== 0) break;
          const firstReal = groundY.find(value => value !== 0) ?? lastKnownGround;
          points[index].y = firstReal + FORMATION_M;
          groundY[index] = firstReal;
        }
      }
      if (points.length < 4) return;

      /**
       * Grade the track across bridges and tunnels instead of letting it follow
       * the terrain model.
       *
       * Height comes from a 30 m DEM, which has the river gorge and the hill in
       * it but knows nothing about the structure crossing them - so the train
       * dived into every valley a viaduct spans and climbed over every ridge the
       * line bores through. Running a straight grade between the ends of each
       * tagged run is what the structure is for: the deck stays level and the
       * ground falls away under it, and the bore goes through the hill rather
       * than over it.
       */
      const runs = brunnelRuns(brunnel, 2);
      for (const run of runs) {
        const startY = points[Math.max(0, run.from - 1)].y;
        const endY = points[Math.min(points.length - 1, run.to + 1)].y;
        const span = Math.max(1, run.to - run.from);
        for (let index = run.from; index <= run.to; index += 1) {
          const graded = startY + (endY - startY) * ((index - run.from) / span);
          /**
           * A bridge deck is level and the ground falls away under it, which is
           * the point of a bridge. A tunnel is the opposite - the real line goes
           * THROUGH the hill - and grading it that way buried the train. There
           * are fourteen kilometres of tunnel between Pretoria and Park Station
           * alone, so for a quarter of that leg the rider was looking at the
           * inside of a terrain tile. This is a map people ride, not a section
           * drawing: through a tunnel the line stays on the surface and the
           * portals mark where the real bore begins.
           */
          points[index].y =
            run.kind === "tunnel"
              ? Math.max(graded, groundY[index] + FORMATION_M)
              : // A bridge deck is level and the ground falls away beneath it -
                // but it is never BELOW that ground. Grading a four-kilometre
                // viaduct straight from end to end dropped its middle under the
                // valley side it crosses.
                Math.max(graded, groundY[index] + FORMATION_M);
        }
      }

      /**
       * Belt and braces: nothing on this line is ever below the ground it runs
       * over, except a bridge deck, which is above it by definition. One bad
       * elevation sample used to be enough to drop the train through the world.
       */
      for (let index = 0; index < points.length; index += 1) {
        const floor = groundY[index] + FORMATION_M;
        if (points[index].y < floor) points[index].y = floor;
      }

      /**
       * Iron out the vertical profile through a tunnel section.
       *
       * The line is kept on the surface through a bore so the train stays in
       * view, but "the surface" through the Hex River gorge is a jagged
       * elevation model, and following it gave a profile that pitched up and
       * down every few hundred metres. The chase camera sits behind and above
       * the train; on a profile like that it spends its time below the next
       * hump, which is exactly the "we lose the train and see the bottom" on the
       * climb out of Matjiesfontein. Twenty passes of a simple average over the
       * height alone - the plan view is untouched - turns it into one steady
       * climb and back down, which is also far closer to what a railway grade
       * actually is.
       */
      const smoothing = new Set<number>();
      for (const run of runs) {
        if (run.kind !== "tunnel") continue;
        for (let index = Math.max(0, run.from - 12); index <= Math.min(points.length - 1, run.to + 12); index += 1) {
          smoothing.add(index);
        }
      }
      if (smoothing.size) {
        for (let pass = 0; pass < 20; pass += 1) {
          const heights = points.map(point => point.y);
          for (const index of smoothing) {
            if (index <= 0 || index >= points.length - 1) continue;
            points[index].y = (heights[index - 1] + 2 * heights[index] + heights[index + 1]) / 4;
            /**
             * Re-floor on every pass, not once at the end. Averaging pulls a
             * crest DOWN, so smoothing after the ground clamp simply undid it
             * and posted the line back under the mountain - with the train
             * inside it, which is the bug this whole section exists to avoid.
             * Clamping inside the loop converges on a smooth profile that still
             * sits on top of the ground.
             */
            const floor = groundY[index] + FORMATION_M;
            if (points[index].y < floor) points[index].y = floor;
          }
        }
      }

      // Smooth before anything consumes it: rails, ballast, train and camera all
      // read from this one array, so they stay in agreement by construction.
      const track = smoothPolyline(points);
      windowPoints = track;
      windowChord = new Array(track.length);
      windowChord[0] = 0;
      for (let index = 1; index < track.length; index += 1) {
        windowChord[index] = windowChord[index - 1] + track[index].distanceTo(track[index - 1]);
      }
      const groundUnder = new WeakMap<THREE.Vector3, number>();
      track.forEach((point, index) => groundUnder.set(point, groundY[index] ?? point.y));
      rollSamples = latLngs.map(latLng => {
        const dLat = 4 / M_PER_DEG_LAT;
        const left = terrain.elevation.heightAt(latLng[0] + dLat, latLng[1]);
        const right = terrain.elevation.heightAt(latLng[0] - dLat, latLng[1]);
        return clamp(Math.atan2(right - left, 8), -0.06, 0.06);
      });

      corridor.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      corridor.clear();

      // Two rails at Cape gauge, plus a ballast ribbon.
      // Brighter than real steel on purpose: at any distance the rails are a
      // couple of pixels wide, and a dark line on dark ground is no line at all.
      const railMaterial = new THREE.MeshStandardMaterial({ color: 0xd2d6d9, metalness: 0.75, roughness: 0.3 });
      for (const offset of [-0.72, 0.72]) {
        const shifted = track.map((point, index) => {
          const next = track[Math.min(index + 1, track.length - 1)];
          const previous = track[Math.max(index - 1, 0)];
          const tangent = next.clone().sub(previous).setY(0).normalize();
          return point.clone().add(new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(offset));
        });
        const rail = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(shifted), track.length, 0.19, 5, false),
          railMaterial,
        );
        rail.castShadow = true;
        corridor.add(rail);
      }
      corridor.add(createBallastRibbon(track));
      // Masts about every 50 m, whatever the sample step happens to be - and
      // anchored to absolute distance, so they do not shuffle along the line
      // every time the window is rebuilt.
      const spanSamples = Math.max(1, Math.round(50 / sampleStepM(speed)));
      const mastOffset =
        (spanSamples - (Math.round((windowStartKm * 1000) / sampleStepM(speed)) % spanSamples)) %
        spanSamples;
      corridor.add(createCatenary(track, spanSamples, mastOffset));

      if (runs.length) {
        corridor.add(createBridgeDecks(track, runs, point => groundUnder.get(point) ?? point.y));
        corridor.add(createTunnelPortals(track, runs));
      }

      const zone = vegetationAtKm(centreKm);
      /**
       * Nothing grows on a viaduct or inside a bore. Without this the tree belt
       * kept planting either side of the deck, so a bridge came with a row of
       * trees hanging in the air beside it at rail height.
       */
      const onStructure = (index: number) =>
        runs.some(run => index >= run.from - 1 && index <= run.to + 1);

      /**
       * Place trees at absolute distances along the route, not at every nth
       * sample of this window.
       *
       * Window-relative placement was the most visible glitch in the whole
       * ride: every rebuild started counting from a different kilometre, so the
       * entire tree belt jumped to new positions two or three times a minute.
       * Bucketing by absolute metres means a tree that exists at km 41.3 is at
       * km 41.3 in every window that contains it, and rebuilds become invisible.
       */
      const treeSamples: THREE.Vector3[] = [];
      const treeSeeds: number[] = [];
      let lastBucket = Number.NaN;
      for (let index = 0; index < track.length; index += 1) {
        const bucket = Math.floor(((windowStartKm + index * stepKm) * 1000) / zone.spacing);
        if (bucket === lastBucket || onStructure(index)) continue;
        lastBucket = bucket;
        treeSamples.push(track[index]);
        treeSeeds.push(bucket);
      }
      const trees = createTreeBelt(treeSamples, foliageMaterialFor(zone.kind), zone, treeSeeds);
      if (trees) corridor.add(trees);
    };

    /**
     * Rough distance in metres from a lat/lon to the built corridor, measured
     * against the window samples already in hand. Only every fourth sample is
     * tested: this runs over a thousand footprints, and the answer only has to
     * be good to a few metres.
     */
    const trackProbe = new THREE.Vector3();
    const distanceToTrack = (point: LatLng) => {
      if (!windowPoints.length) return Infinity;
      const local = toLocalMetres(point, origin);
      trackProbe.set(local.x, 0, local.z);
      let best = Infinity;
      for (let index = 0; index < windowPoints.length; index += 4) {
        const sample = windowPoints[index];
        const distance = (sample.x - trackProbe.x) ** 2 + (sample.z - trackProbe.z) ** 2;
        if (distance < best) best = distance;
      }
      return Math.sqrt(best);
    };

    /**
     * The closest ANY corner of a footprint comes to the line.
     *
     * Testing one vertex was not enough and Park Station is the proof: its
     * building is mapped as a single footprint several hundred metres long over
     * the platforms, so its first corner sits well clear of the track while its
     * body covers it completely. Extruded, that is a solid block standing on the
     * line with the train inside it - which is what "underground in
     * Johannesburg" turned out to be. Every corner gets tested now.
     */
    const ringClearsTrack = (ring: LatLng[]) => {
      const stride = Math.max(1, Math.floor(ring.length / 12));
      for (let index = 0; index < ring.length; index += stride) {
        if (distanceToTrack(ring[index]) <= TRACK_CLEARANCE_M) return false;
      }
      return true;
    };

    const refreshBuildings = (centre: LatLng) => {
      // Refetch by distance moved, not by a rounded key: a key on three
      // decimals re-ran the whole vector-tile fetch every hundred metres.
      const key = `${centre[0].toFixed(2)}/${centre[1].toFixed(2)}`;
      if (key === buildingsKey) return;
      buildingsKey = key;
      buildingsController?.abort();
      buildingsController = new AbortController();
      const controller = buildingsController;
      fetchBuildingsFromTiles(centre, 1600, controller.signal)
        .then(async footprints => {
          if (controller.signal.aborted) return;
          /**
           * Roof colours are sampled from imagery, but this must not gate the
           * buildings. A +/-0.02 degree box at z17 is about 256 tiles; awaiting
           * it meant the extrusions never appeared at all. Keep the box to the
           * near terrain ring, whose tiles are already in the HTTP cache, so
           * only the pixel decode is new work.
           */
          await terrain.imagery
            .prefetch(centre[0] + 0.007, centre[0] - 0.007, centre[1] - 0.008, centre[1] + 0.008)
            .catch(() => undefined);
          if (controller.signal.aborted) return;
          const previous = buildingsGroup;
          /**
           * Nothing may stand on the track.
           *
           * OSM has platform canopies, signal huts and goods sheds mapped right
           * up against the rails, and extruding those puts a box across the line
           * that the train then drives straight through. Anything whose centroid
           * falls inside the swept corridor is dropped - the imagery underneath
           * still shows it, so the station does not look emptied out.
           */
          const clear = footprints.filter(footprint => ringClearsTrack(footprint.ring));
          /**
           * Add the replacement BEFORE dropping what is there. Removing first
           * left a gap of one vector-tile round trip with no town in it, so a
           * place blinked out and back every kilometre or so.
           */
          buildingsGroup = createBuildings(clear, origin, terrain.elevation, terrain.imagery);
          scene.add(buildingsGroup);
          if (previous) {
            scene.remove(previous);
            previous.traverse(object => {
              if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                (object.material as THREE.Material).dispose();
              }
            });
          }
        })
        .catch(() => undefined);

      /**
       * Streets, from the same tiles. Without them a town is a field of loose
       * boxes standing on a photograph; the grid between them is most of what
       * makes it read as a place from a passing train.
       */
      fetchRoadsFromTiles(centre, 1600, controller.signal)
        .then(roads => {
          if (controller.signal.aborted) return;
          const previousRoads = roadsGroup;
          /**
           * Drop roads that run ALONG the track rather than across it.
           *
           * The road ribbons are flat surfaces with a polygon offset, drawn at
           * much coarser precision than the rails; where one ran beside the
           * line - yard access roads, station approaches - it covered the rail
           * and the rail appeared to vanish. A level crossing only touches the
           * corridor at a point, so it survives this; a parallel road does not.
           */
          const alongside = (road: { path: LatLng[] }) => {
            const probes = [road.path[0], road.path[Math.floor(road.path.length / 2)], road.path[road.path.length - 1]];
            const near = probes.filter(point => point && distanceToTrack(point) < 16).length;
            return near >= 2;
          };
          roadsGroup = createRoads(roads.filter(road => !alongside(road)), origin, terrain.elevation);
          scene.add(roadsGroup);
          if (previousRoads) {
            scene.remove(previousRoads);
            previousRoads.traverse(object => {
              if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                (object.material as THREE.Material).dispose();
              }
            });
          }
        })
        .catch(() => undefined);
    };

    let ready = false;
    let streamingTerrain = false;

    /**
     * Stream the imagery rings. Separate from recentre() on purpose.
     *
     * These used to happen together, and that was the single worst thing about
     * the ride in motion: the corridor is rebuilt every kilometre or two, but
     * the sharpest imagery ring is only about seven hundred metres across. Tied
     * to the corridor's cadence, the train left the sharp ring within seconds of
     * each rebuild and spent most of the journey outside it, on ground the
     * coarse ring had to cover. The rings now re-centre every few hundred
     * metres, which is what they are sized for, and cost almost nothing when
     * they do: the streamer keeps the tiles it already has and fetches only the
     * new edge.
     *
     * The centre leads the train, because the chase camera looks down the line
     * and half of a train-centred ring is behind it and never seen.
     */
    const streamTerrain = async (atKm: number) => {
      if (streamingTerrain) return;
      streamingTerrain = true;
      const speed = stateRef.current.speed;
      terrain.setNearDetail(speed <= 4);
      terrain.setNearRing(1);
      const lead = clamp(0.25 * Math.max(1, speed), 0.25, 1.2);
      try {
        await terrain.update(positionAt(Math.min(TOTAL_KM, atKm + lead)));
      } finally {
        streamingTerrain = false;
      }
    };

    /**
     * Shift the floating origin.
     *
     * Order matters, and I got it wrong once already. The elevation model is
     * what the corridor is built on, so it has to be in hand BEFORE the track
     * is rebuilt - rebuilding first and streaming after meant the rails were
     * laid at whatever heights happened to be cached, which near a window edge
     * is sea level. The DEM is small and follows the line, so waiting for it
     * costs a fraction of a second. The satellite imagery is the slow part and
     * the corridor does not depend on it, so that still streams afterwards and
     * fills in underneath.
     */
    const recentre = async (atKm: number) => {
      const nextOrigin = positionAt(atKm);
      const speed = stateRef.current.speed;
      terrain.setNearDetail(speed <= 4);
      terrain.setNearRing(1);

      // The elevation tiles this window will sample, followed along the line
      // rather than over its bounding box.
      const reach = windowDistanceKm(speed);
      const demPath: LatLng[] = [];
      for (let at = Math.max(0, atKm - reach); at <= Math.min(TOTAL_KM, atKm + reach); at += 0.5) {
        demPath.push(positionAt(at));
      }
      /**
       * Never let a bad tile stop the world. The heights are worth waiting a
       * moment for, but not worth freezing the ride over: if they do not come,
       * the corridor is built on what is cached and corrected on the next pass.
       */
      try {
        await terrain.elevation.prefetchPath(demPath);
      } catch {
        // carry on with whatever elevation is already in hand
      }

      /**
       * Carry the standing buildings and streets into the new frame rather than
       * deleting them. A floating-origin shift is a translation; applying it
       * keeps the town on screen while the replacement set is fetched.
       */
      {
        const shift = toLocalMetres(origin, nextOrigin);
        const delta = new THREE.Vector3(shift.x, 0, shift.z);
        buildingsGroup?.position.add(delta);
        roadsGroup?.position.add(delta);
      }

      origin = nextOrigin;
      terrain.setOrigin(origin);
      rebuildCorridor(atKm);
      ready = true;
      refreshBuildings(origin);
      await streamTerrain(atKm);
    };

    void recentre(stateRef.current.km).catch(error =>
      console.error("[ShosholozaTrail] ride world failed to build", error),
    );

    // ── Train ───────────────────────────────────────────────────────────────
    const emu = createCommuterTrain(CAR_COUNT);
    scene.add(emu.group);
    /** Set once a real .glb is supplied; until then the procedural EMU is driven. */
    let loadedTrain: THREE.Object3D | null = null;
    new GLTFLoader().load(
      TRAIN_ASSET_PATH,
      loaded => {
        scene.remove(emu.group);
        const box = new THREE.Box3().setFromObject(loaded.scene);
        const length = Math.max(0.001, box.max.x - box.min.x);
        loaded.scene.scale.setScalar(24 / length);
        loaded.scene.traverse(object => {
          object.castShadow = true;
          object.frustumCulled = true;
        });
        scene.add(loaded.scene);
        loadedTrain = loaded.scene;
      },
      undefined,
      () => undefined,
    );
    new RGBELoader().load(
      "/assets/shosholoza.hdr",
      environment => {
        environment.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = environment;
      },
      undefined,
      () => undefined,
    );

    // ── Station labels ──────────────────────────────────────────────────────
    const labels = new Map<string, HTMLButtonElement>();
    for (const stop of stops) {
      const label = document.createElement("button");
      label.className = "st-webgl-label";
      label.type = "button";
      label.textContent = stop.name;
      label.addEventListener("click", () => stateRef.current.onStopClick(stop));
      mount.appendChild(label);
      labels.set(stop.id, label);
    }

    const observer = new ResizeObserver(() => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    observer.observe(mount);

    // ── Animation ───────────────────────────────────────────────────────────
    const trainPosition = new THREE.Vector3();
    const aheadPoint = new THREE.Vector3();
    const behindPoint = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const sideways = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const labelWorld = new THREE.Vector3();
    const cameraLookTarget = new THREE.Vector3();
    const overviewPosition = new THREE.Vector3();
    const overviewTarget = new THREE.Vector3();
    const ridePosition = new THREE.Vector3();
    /**
     * The chase camera's height, damped. Clearing a ridge changes the required
     * height as the ridge comes in and out of the eight samples taken along the
     * sight line, and stepping to it directly reads as a twitch. Easing to it
     * does not.
     */
    let chaseHeight = Number.NaN;
    const rideTarget = new THREE.Vector3();
    const consistMid = new THREE.Vector3();
    const previousCameraPosition = new THREE.Vector3();
    const previousLookTarget = new THREE.Vector3();
    const billboardPosition = new THREE.Vector3();
    const carPosition = new THREE.Vector3();
    const carAhead = new THREE.Vector3();
    const carBehind = new THREE.Vector3();
    const carDirection = new THREE.Vector3();

    let previousPlaying = stateRef.current.playing;
    let cameraBlend = 1;
    let revealProgress = 0;
    let lastWindowKm = stateRef.current.km;
    let lastTerrainKm = stateRef.current.km;
    let streaming = false;
    let previousTime = performance.now();
    let frame = 0;

    const animate = (currentTime: number) => {
      frame = requestAnimationFrame(animate);
      const deltaSeconds = Math.min(0.05, Math.max(0, (currentTime - previousTime) / 1000));
      previousTime = currentTime;
      const current = stateRef.current;

      if (!ready || !windowPoints.length) {
        renderer.render(scene, camera);
        return;
      }

      // Floating origin + route window keep precision and detail around the train.
      if (!streaming && Math.abs(current.km - lastWindowKm) > rebuildDistanceKm(current.speed)) {
        lastWindowKm = current.km;
        lastTerrainKm = current.km;
        streaming = true;
        void recentre(current.km).finally(() => {
          streaming = false;
        });
      } else if (!streaming && Math.abs(current.km - lastTerrainKm) > terrainStepKm(current.speed)) {
        lastTerrainKm = current.km;
        void streamTerrain(current.km);
      }

      // Cab position, never closer to the start than the train is long.
      const leadKm = clamp(current.km, TRAIN_LENGTH_KM, TOTAL_KM);
      pointAtKm(leadKm, trainPosition);
      backdrop.position.set(trainPosition.x, trainPosition.y - BACKDROP_DROP_M, trainPosition.z);
      pointAtKm(clamp(leadKm + 0.02, 0, TOTAL_KM), aheadPoint);
      pointAtKm(clamp(leadKm - 0.02, 0, TOTAL_KM), behindPoint);
      tangent.copy(aheadPoint).sub(behindPoint);
      const horizontalLength = Math.max(0.001, Math.hypot(tangent.x, tangent.z));
      const grade = Math.atan2(tangent.y, horizontalLength);
      tangent.normalize();
      sideways.set(-tangent.z, 0, tangent.x).normalize();

      if (loadedTrain) {
        loadedTrain.rotation.order = "YXZ";
        loadedTrain.position.copy(trainPosition);
        loadedTrain.rotation.set(grade, Math.atan2(tangent.x, tangent.z), rollAtKm(leadKm));
      } else {
        // Each car sits at its own point on the curve, so the set articulates
        // through bends instead of pivoting as one rigid 95 m plank.
        const leadChord = chordAtKm(leadKm);
        emu.cars.forEach((car, index) => {
          car.rotation.order = "YXZ";
          // Measured in metres of track, not kilometres of route.
          const carChord = leadChord - index * CAR_PITCH_M;
          const carKm = kmAtChord(carChord);

          /**
           * A carriage sits on its two ends, not on its middle.
           *
           * Taking the heading from six metres either side of the centre meant
           * two adjacent carriages could read their direction from two
           * different segments of the polyline and come out at an angle to each
           * other - which on a curve swings their ends apart and reads as the
           * train coming uncoupled. Measuring across the carriage's own length
           * instead is both what a real bogie-mounted body does and a long
           * enough baseline to cross a segment boundary smoothly: consecutive
           * carriages now share the end points they meet at.
           */
          const halfCar = CAR_LENGTH_M / 2;
          pointAtChord(carChord + halfCar, carAhead);
          pointAtChord(carChord - halfCar, carBehind);
          carPosition.copy(carAhead).add(carBehind).multiplyScalar(0.5);
          carDirection.copy(carAhead).sub(carBehind);
          const carLength = Math.max(0.001, Math.hypot(carDirection.x, carDirection.z));
          car.position.copy(carPosition);
          car.rotation.set(
            Math.atan2(carDirection.y, carLength),
            Math.atan2(carDirection.x, carDirection.z),
            rollAtKm(carKm),
          );
        });
      }

      sun.target.position.copy(trainPosition);
      sun.position.copy(trainPosition).add(new THREE.Vector3(-320, 520, 280));
      sky.position.copy(camera.position);

      revealProgress = THREE.MathUtils.damp(revealProgress, current.playing ? 1 : 0.55, 2.4, deltaSeconds);
      foliageMaterials.forEach(material => { material.opacity = revealProgress; });

      for (const entry of billboards) {
        const opacity = billboardOpacity(entry.landmark.km, leadKm);
        const material = entry.sprite.material as THREE.SpriteMaterial;
        material.opacity = opacity;
        entry.sprite.visible = opacity > 0.01;
        if (!entry.sprite.visible) continue;
        const aheadM = Math.max(0, Math.round((entry.landmark.km - leadKm) * 1000));
        entry.draw(
          `${aheadM} m along track`,
          entry.landmark.offsetM
            ? `Actual distance ${(entry.landmark.offsetM / 1000).toFixed(1)} km from track`
            : entry.landmark.note,
        );
        pointAtKm(clamp(entry.landmark.km, windowStartKm, windowEndKm), billboardPosition);
        entry.sprite.position.copy(billboardPosition).addScaledVector(sideways, 9).setY(billboardPosition.y + 7);
      }

      /**
       * Reassign the marker pool only when the train has actually moved far
       * enough for the shortlist to change - filtering three hundred places
       * every frame is wasted work at sixty hertz.
       */
      const nextKey = Math.floor(leadKm * 8);
      if (nextKey !== placesKey) {
        placesKey = nextKey;
        visiblePlaces = thinLabels(placesNear(leadKm), placeMarkers.length);
      }

      for (let index = 0; index < placeMarkers.length; index += 1) {
        const marker = placeMarkers[index];
        const place = visiblePlaces[index];
        const material = marker.sprite.material as THREE.SpriteMaterial;
        if (!place) {
          marker.sprite.visible = false;
          continue;
        }
        /**
         * Up from about 4 km out, hold while it is alongside, down once it is
         * behind. Names that pop on at full strength are what makes a label
         * layer feel like clutter.
         */
        const aheadKm = place.km - leadKm;
        const opacity =
          aheadKm >= 0 ? Math.min(1, (4 - aheadKm) / 1.4) : Math.max(0, 1 + aheadKm / 1.6);
        material.opacity = Math.max(0, opacity) * 0.9;
        marker.sprite.visible = material.opacity > 0.01;
        if (!marker.sprite.visible) continue;
        marker.draw(place.name, place.station);
        pointAtKm(clamp(place.km, windowStartKm, windowEndKm), billboardPosition);
        const hand = place.side === "left" ? -1 : 1;
        marker.sprite.position
          .copy(billboardPosition)
          .addScaledVector(sideways, hand * 42)
          // Alternating heights: where two names survive the thinning and still
          // land close together, one sits above the other instead of through it.
          .setY(billboardPosition.y + 22 + (index % 2) * 15);
      }

      /**
       * Keep the camera above the ground, and keep the train in sight over it.
       *
       * Two different failures, one cause: through a pass the line climbs hard,
       * and a camera two hundred metres behind the train sits below the ridge
       * the train has just come over. First it ends up inside the hillside;
       * then, once it is out, the hill between the two blocks the train and all
       * you can see is the slope in front of you - the train vanishes and you
       * are looking at the bottom of the climb.
       *
       * So: lift the camera clear of whatever is directly beneath it, then walk
       * the ground between camera and train and lift again until the straight
       * line between them clears every bit of it. On the flat neither does
       * anything; on the Hex River climb it rises just enough to keep the train
       * in frame.
       */
      const groundAtLocal = (x: number, z: number) => {
        const where = fromLocalMetres(x, z, origin);
        if (!terrain.elevation.hasCoverage(where[0], where[1])) return null;
        return terrain.elevation.heightAt(where[0], where[1]);
      };

      /**
       * Lift the camera clear of the ground it is standing over. Nothing more.
       *
       * There was a sight-line test here that walked the ground between the
       * camera and the train and raised the camera until the line was clear. It
       * read well on paper and was wrong in practice: over that span - a
       * hundred-odd metres, most of it alongside the train itself - the "ground"
       * it measured was the cutting the railway runs in. The ground beside a
       * railway is higher than the railway, so in the Hex River gorge it decided
       * it was blocked at every single frame and climbed to its ceiling, which
       * is how the train ended up a speck at the top of the screen.
       *
       * The real cause of losing the train there was the track profile itself,
       * which is smoothed properly now - see the corridor builder.
       */
      const clearTheGround = (point: THREE.Vector3, clearance: number) => {
        const under = groundAtLocal(point.x, point.z);
        if (under !== null) point.y = Math.max(point.y, under + clearance);
      };

      if (current.follow) {
        if (current.firstPerson) {
          ridePosition
            .copy(trainPosition)
            .addScaledVector(tangent, -CHASE_BACK_M)
            .addScaledVector(sideways, current.viewYaw * 55)
            /**
             * Higher on a climb. The steeper the grade, the further the train
             * runs up out of the bottom of the frame while the camera stares at
             * the slope it is still on - which is the "we lose the train and see
             * the bottom" on the way out of Matjiesfontein.
             */
            .setY(trainPosition.y + CHASE_UP_M + Math.max(0, grade) * 220 + current.viewPitch * 16);
          // The middle of the consist: what the shot is framed on, and what has
          // to stay in sight over a crest.
          pointAtChord(chordAtKm(leadKm) - CHASE_AIM_BACK_M, consistMid);
          clearTheGround(ridePosition, 14);
          if (!Number.isFinite(chaseHeight) || Math.abs(chaseHeight - ridePosition.y) > 300) {
            chaseHeight = ridePosition.y;
          } else {
            chaseHeight = THREE.MathUtils.damp(chaseHeight, ridePosition.y, 3.2, deltaSeconds);
          }
          ridePosition.y = chaseHeight;
          const lookAheadKm = clamp(leadKm + LOOK_AHEAD_KM_AT_ONE_X, windowStartKm, windowEndKm);
          pointAtKm(lookAheadKm, rideTarget);
          rideTarget.sub(trainPosition).normalize().multiplyScalar(70).add(trainPosition);
          // Split the difference between the road ahead and the train itself,
          // so a steep climb tips the shot down onto the consist instead of
          // pointing it at the sky over the brow.
          /**
           * Weighted firmly onto the train rather than the road ahead. Aiming
           * seventy metres up the line is a fine shot on the flat and puts the
           * consist at the very bottom of the picture on a grade.
           */
          rideTarget.lerp(consistMid, 0.78);
          rideTarget.y = Math.max(rideTarget.y, consistMid.y + 3) + current.viewPitch * 18;

          /**
           * The standing shot, used while paused and on arrival.
           *
           * Kept ON the line rather than off to one side. Buildings within
           * seventeen metres of the centreline are already removed - they are
           * the platform canopies and goods sheds the train would otherwise
           * drive through - so a camera over the track is the one place in a
           * city centre that is reliably empty. Offsetting it fifty metres into
           * the Johannesburg CBD put it inside a tower, and the arrival shot was
           * the dark inside of a building.
           *
           * Height clears the skyline when we know it, and assumes a city when
           * we do not: the building set for a new area lands a moment after the
           * jump does, and guessing low is what breaks.
           */
          /**
           * The standing shot stays low and on the line.
           *
           * Looking down on a city from two hundred metres showed the massing
           * from above, which is the one angle box extrusions have nothing to
           * offer at - and it is not what a rider wants either. Forty-odd
           * metres up, a couple of train-lengths back, on the centreline: the
           * consist standing at the platform with the place around it. Buildings
           * within seventeen metres of the line are already removed, so the
           * centreline is the one column in a city centre that is reliably
           * clear.
           */
          overviewPosition
            .copy(trainPosition)
            .addScaledVector(tangent, -TRAIN_LENGTH_M * 1.7)
            .setY(trainPosition.y + 48);
          clearTheGround(overviewPosition, 20);
          overviewTarget.copy(trainPosition).addScaledVector(tangent, -TRAIN_LENGTH_M * 0.3);

          if (current.playing && !previousPlaying) {
            previousCameraPosition.copy(camera.position);
            previousLookTarget.copy(cameraLookTarget.lengthSq() ? cameraLookTarget : overviewTarget);
            cameraBlend = 0;
          }
          if (current.playing) {
            cameraBlend = clamp(cameraBlend + deltaSeconds / 1.2, 0, 1);
            const eased =
              cameraBlend < 0.5 ? 4 * cameraBlend ** 3 : 1 - (-2 * cameraBlend + 2) ** 3 / 2;
            camera.position.lerpVectors(previousCameraPosition, ridePosition, eased);
            cameraLookTarget.lerpVectors(previousLookTarget, rideTarget, eased);
            if (eased >= 1) {
              camera.position.copy(ridePosition);
              cameraLookTarget.copy(rideTarget);
            }
          } else {
            const damping = 1 - Math.exp(-2.6 * deltaSeconds);
            camera.position.lerp(overviewPosition, damping);
            cameraLookTarget.lerp(overviewTarget, damping);
          }
        } else {
          /**
           * The unfollowed overview, used by the journey and live pages.
           *
           * This used to sit at a fixed world offset - four hundred metres up
           * and six hundred to the south, whichever way the line happened to
           * run. South of Kimberley the railway runs west, so the train slid
           * sideways across the screen instead of running away from you, and
           * the same train that moved forward on the ride appeared to travel
           * left here. Hanging the camera off the tangent instead puts the
           * heading up the screen wherever the line goes, and aiming a little
           * ahead of the locomotive shows what it is running into rather than
           * what it has left.
           */
          overviewPosition
            .copy(trainPosition)
            .addScaledVector(tangent, -620)
            .setY(trainPosition.y + 420);
          overviewTarget.copy(trainPosition).addScaledVector(tangent, 140);
          const damping = 1 - Math.exp(-2.6 * deltaSeconds);
          camera.position.lerp(overviewPosition, damping);
          cameraLookTarget.lerp(overviewTarget, damping);
        }
        camera.lookAt(cameraLookTarget);
      }
      previousPlaying = current.playing;

      for (const stop of current.stops) {
        const label = labels.get(stop.id);
        if (!label) continue;
        const local = toLocalMetres([stop.lat, stop.lon], origin);
        labelWorld.set(local.x, terrain.elevation.heightAt(stop.lat, stop.lon) + 12, local.z);
        const range = camera.position.distanceTo(labelWorld);
        projected.copy(labelWorld).project(camera);
        const onScreen = projected.z < 1 && range < LABEL_RANGE_M;
        /**
         * Fade with distance instead of switching on and off. A city 8 km out
         * should be a whisper, not a hard pop - and the nearest one carries
         * full weight without any of them ever obscuring the ground.
         */
        const nearness = 1 - Math.min(1, Math.max(0, (range - 900) / (LABEL_RANGE_M - 900)));
        label.style.opacity = onScreen ? (0.2 + nearness * 0.8).toFixed(2) : "0";
        label.style.pointerEvents = onScreen && nearness > 0.25 ? "auto" : "none";
        // Anchored above the ground point so the riser meets the terrain.
        label.style.transform = `translate(-50%, -100%) translate3d(${(projected.x * 0.5 + 0.5) * mount.clientWidth}px, ${(-projected.y * 0.5 + 0.5) * mount.clientHeight}px, 0)`;
        label.classList.toggle("is-active", stop.id === current.activeStop.id);
      }

      renderer.render(scene, camera);
    };
    animate(performance.now());

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      buildingsController?.abort();
      labels.forEach(label => label.remove());
      terrain.dispose();
      foliageMaterials.forEach(material => {
        material.map?.dispose();
        material.dispose();
      });
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
          else object.material.dispose();
        }
      });
      /**
       * Give the WebGL context back, not just the JavaScript objects.
       *
       * dispose() frees three's own buffers but leaves the context itself
       * alive, and a browser only grants a handful — around sixteen — before it
       * starts dropping the oldest. Moving between the ride, the journey and
       * the live map a few times was enough to use them all up, and from then
       * on the map was a blank grey rectangle with no error to explain it. This
       * is the line that hands the context back.
       */
      renderer.forceContextLoss();
      renderer.dispose();

      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={["st-map", "st-webgl-map", className].filter(Boolean).join(" ")}
      aria-label="Shosholoza Trail interactive 3D railway map"
    />
  );
}

