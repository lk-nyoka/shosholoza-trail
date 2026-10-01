import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { readRideRoute } from '../ride-model';
import { createTrainModel, sampleTrainCoordinate, TRAIN_LIVERY } from '../train-model';
import { createStationStudy } from './StationScene';
import { playStationVisit } from './StationVisit';
import { RideCamera } from './RideCamera';
import { createWindowPlaces } from './WindowPlaces';
import { PassengerWindow } from './PassengerWindow';
import { DustEffect } from './DustEffect';
import { SkyDome, SKY } from './SkyDome';
import { createCatenary } from './Catenary';
import { createBuildings, type BuildingData } from './Buildings';
import { createRoads, isGradeSeparated, type RoadData } from './Roads';
import { findBridgeSites, createBridges } from './Bridges';
import { TrainSound } from './TrainSound';
import { createVegetation } from './Vegetation';
import { createWaypoints, type PlaceData, type Place } from './Waypoints';
import { Terrain, type TerrainData } from './Terrain';
import { findCrossings, createLevelCrossings } from './LevelCrossings';
import { TrainWheels } from './TrainWheels';
import { createConsist } from './TrainConsist';
import { createLineside } from './Lineside';
import { TimeOfDay, TIME_PRESETS, type TimeKey } from './TimeOfDay';
import { JourneyDirector, type LandmarkDefinition, type DirectorState } from './JourneyDirector';
import type { CinematicPose } from './CinematicCamera';
import { createFreedomPark } from './landmarks/FreedomPark';
import { createFountainsValley } from './landmarks/FountainsValley';
import { createVoortrekkerMonument } from './landmarks/VoortrekkerMonument';
import { createHalts, selectHalts } from './Halts';
import { createBirds } from './Birds';
import { createStreetLights } from './StreetLights';
import { createPassengers, platformSpots } from './Passengers';

/** Every landmark in the Pretoria slice. One list, so the scene and the debug panel cannot disagree. */
export const LANDMARK_IDS = ['freedom-park', 'voortrekker-monument', 'fountains-valley'] as const;

export async function createRailScene(host: HTMLElement, signal: AbortSignal, report: (distance: number, fps: number) => void, visitChanged: (label: string | null) => void = () => {}, journeyChanged: (state: { mode: DirectorState['mode']; landmark: LandmarkDefinition | null }) => void = () => {}, passing: (place: Place | null) => void = () => {}) {
  const [routeResponse, locomotive, coach, personModel, buildingData, roadData, terrainData, placeData, landmarkDefinitions] = await Promise.all([
    fetch('/data/route-animation.geojson', { signal }).then(r => { if (!r.ok) throw new Error('Local rail geometry is unavailable'); return r.json(); }),
    new GLTFLoader().loadAsync('/assets/models/train/quaternius-electric.glb'),
    new GLTFLoader().loadAsync('/assets/models/train/quaternius-passenger.glb'),
    // Sketchbook's mannequin (MIT). Optional: the station is fine empty.
    new GLTFLoader().loadAsync('/assets/models/people/boxman.glb').catch(() => null),
    // Landmarks are content. A missing file costs the cinematic, not the ride.
    // Real footprints. Missing data costs the city, not the ride.
    fetch('/data/pretoria-buildings.json', { signal }).then(r => r.ok ? r.json() as Promise<BuildingData> : null).catch(() => null),
    fetch('/data/pretoria-roads.json', { signal }).then(r => r.ok ? r.json() as Promise<RoadData> : null).catch(() => null),
    fetch('/data/pretoria-terrain.json', { signal }).then(r => r.ok ? r.json() as Promise<TerrainData> : null).catch(() => null),
    fetch('/data/pretoria-places.json', { signal }).then(r => r.ok ? r.json() as Promise<PlaceData> : null).catch(() => null),
    Promise.all(LANDMARK_IDS.map(id => fetch(`/data/landmarks/${id}.json`, { signal })
      .then(r => r.ok ? r.json() as Promise<LandmarkDefinition> : null)
      .catch(() => null))).then(list => list.filter((item): item is LandmarkDefinition => item !== null)),
  ]);
  const disposeObject = (root: THREE.Object3D) => root.traverse(object => {
    if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mat.dispose(); }
    // Geometry and material do not own the per-instance buffers; this does.
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  if (signal.aborted) { disposeObject(locomotive.scene); disposeObject(coach.scene); if (personModel) disposeObject(personModel.scene); return null; }
  const route = readRideRoute(routeResponse);
  const model = createTrainModel(route.geometry.coordinates);
  const origin = route.geometry.coordinates[0];
  /** Flat projection; y is filled in once the terrain exists. */
  const flat = (lon: number, lat: number) => new THREE.Vector3(
    (lon - origin[0]) * 111320 * Math.cos(origin[1] * Math.PI / 180), 0, -(lat - origin[1]) * 110540);
  const routeLengthMetres = model.cumulative.at(-1) ?? 6500;
  const terrain = terrainData ? new Terrain(terrainData, flat, routeLengthMetres) : null;
  // Level the ground under each landmark before anything is built on it, and
  // remember the pad height so the landmark can be set on it exactly.
  const landmarkBase = new Map<string, number>();
  for (const definition of landmarkDefinitions) {
    if (!terrain || !definition.footprint) continue;
    const at = flat(definition.location.lon, definition.location.lat);
    landmarkBase.set(definition.id, terrain.addStamp({ x: at.x, z: at.z, ...definition.footprint }));
  }
  /** Ground level at a scene position. Zero when there is no heightfield. */
  const groundAt = (x: number, z: number) => terrain ? terrain.heightAt(x, z) : 0;
  // Everything anchored to the rail reads its height from here, so grading the
  // track once lifts sleepers, catenary, lineside and the train together.
  const project = (s: number) => {
    const p = sampleTrainCoordinate(model, s);
    const v = flat(p[0], p[1]);
    v.y = terrain ? terrain.railAt(s) : 0;
    return v;
  };
  const basis = (s: number) => project(s + 8).sub(project(s - 8)).normalize();
  /** Landmarks are placed by real coordinates, not by route position. */
  const projectLngLat = (lon: number, lat: number) => {
    const v = flat(lon, lat);
    v.y = groundAt(v.x, v.z);
    return v;
  };
  const scene = new THREE.Scene();
  // Fog matches the sky's horizon band so distant geometry dissolves into it
  // instead of ending against a different colour.
  const horizonHex = `#${SKY.horizon.getHexString()}`;
  // Fog used to start at 350 m, which bleached everything past the next grove
  // and flattened the corridor. Starting further out keeps the middle distance
  // readable and leaves the haze for the horizon, where it belongs.
  scene.fog = new THREE.Fog(horizonHex, 900, 3400);
  const sky = new SkyDome(); scene.add(sky.group);
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor(horizonHex);
  // Without shadows every object floats and the whole scene reads as plastic.
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(45, 1, .5, 2500);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 18; controls.maxDistance = 500; controls.maxPolarAngle = Math.PI / 2 - .035;
  const hemisphere = new THREE.HemisphereLight('#fff9de', '#5c6849', 2.4); scene.add(hemisphere); const sun = new THREE.DirectionalLight('#ffe4b4', 3); sun.position.set(-150, 240, 100); scene.add(sun);
  // A directional light's shadow camera covers a fixed box, so one spanning the
  // whole 5 km would spend its entire 2048px on ground nobody is looking at.
  // This one is 420 m wide and is carried along with the train every frame.
  let sunOffset = new THREE.Vector3(-150, 240, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -210; sun.shadow.camera.right = 210;
  sun.shadow.camera.top = 210; sun.shadow.camera.bottom = -210;
  sun.shadow.camera.near = 40; sun.shadow.camera.far = 760;
  // normalBias is in world units and pushes the sample along the surface
  // normal. Anything approaching the width of the train pushes its own shadow
  // out from under it entirely, so this stays well below a metre.
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  const sunTarget = new THREE.Object3D(); scene.add(sunTarget); sun.target = sunTarget;
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string) => { if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: .9 })); return mats.get(color)!; };
  /** Materials that glow after dark. Registered here, driven by TimeOfDay. */
  const emissive: { material: THREE.MeshStandardMaterial; colour: string; peak: number }[] = [];
  const glowing = (colour: string, glow: string, peak: number) => {
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: .55 });
    emissive.push({ material, colour: glow, peak });
    return material;
  };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map<string, THREE.Matrix4[]>();
  const box = (size: number[], at: THREE.Vector3, color: string, rotation = 0) => { const transform = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), new THREE.Vector3(...size as [number, number, number])); if (!batches.has(color)) batches.set(color, []); batches.get(color)!.push(transform); };
  /**
   * How far the built world extends, either side of the journey. Track is laid
   * from behind the start so there is something under the consist, which trails
   * 259 m back, and past the end so the last frame is not a cliff edge.
   */
  const WORLD_START = -500;
  const WORLD_END = Math.min(6_500, Math.floor(routeLengthMetres));

  const GROUND_COLOUR = '#8e9b70';
  // Pretoria station stands beside the line at rail level. Without a pad the
  // real ground - up to several metres above rail level here - came through the
  // building and the platform. Stamped here, after project() exists and before
  // the terrain mesh is built from the heights.
  const STATION_ALONG = -45, STATION_OFFSET = 26;
  const stationDirection = basis(0), stationAngle = Math.atan2(-stationDirection.z, stationDirection.x);
  const stationSide = new THREE.Vector3(-stationDirection.z, 0, stationDirection.x);
  const stationAnchor = project(STATION_ALONG).addScaledVector(stationSide, STATION_OFFSET);
  terrain?.addStamp({ x: stationAnchor.x, z: stationAnchor.z, inner: 100, outer: 165, base: stationAnchor.y });
  terrain?.carveRail(project, WORLD_START, WORLD_END);

  if (terrain) {
    // Vertex colours carry the ground tint, so the material itself is white.
    const groundMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96, vertexColors: true });
    scene.add(terrain.build(groundMaterial));
    // Embankment where the land falls away, cutting where it rises.
    scene.add(terrain.buildFormation({ project, basis }, WORLD_START, WORLD_END, mat('#9a9276')));
  } else {
    // No heightfield: fall back to the flat plane rather than to nothing.
    box([14000, 2, 14000], new THREE.Vector3(0, -1.6, 0), GROUND_COLOUR);
  }
  // All scenery is an authored approximation, not satellite-derived geometry.
  const sleeperGeometry = new THREE.BoxGeometry(2.7, .15, .25);
  // One every two metres across the built world.
  const sleeperCount = Math.floor((WORLD_END - WORLD_START) / 2);
  const sleepers = new THREE.InstancedMesh(sleeperGeometry, mat('#82735f'), sleeperCount);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < sleeperCount; i++) { const s = WORLD_START + i * 2, p = project(s), d = basis(s); q.setFromAxisAngle(up, Math.atan2(-d.z, d.x) + Math.PI / 2); matrix.compose(p, q, new THREE.Vector3(1, 1, 1)); sleepers.setMatrixAt(i, matrix); }
  sleepers.receiveShadow = true; scene.add(sleepers);
  for (let s = WORLD_START; s < WORLD_END; s += 10) {
    const a = project(s), b = project(s + 10), d = b.clone().sub(a), mid = a.clone().add(b).multiplyScalar(.5), angle = Math.atan2(-d.z, d.x);
    box([d.length() + .1, .18, 4.3], mid.clone().setY(mid.y - .05), '#b8ad96', angle);
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    for (const sign of [-1, 1]) box([d.length() + .1, .16, .09], mid.clone().addScaledVector(side, sign * .5335).setY(mid.y + .2), '#535e60', angle);
  }
  const trunkGeometry = new THREE.CylinderGeometry(.45, .7, 6, 5), crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const trees = Math.round((WORLD_END - WORLD_START) / 20), trunks = new THREE.InstancedMesh(trunkGeometry, mat('#72614c'), trees), crowns = new THREE.InstancedMesh(crownGeometry, mat('#9870ad'), trees * 4);
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.15, .3, 1, 5), mat('#72614c'), trees * 3);
  // Crowns are re-composed every frame for wind, so their rest state is kept
  // rather than read back out of the instance matrices.
  const crownRest: { position: THREE.Vector3; scale: THREE.Vector3; phase: number }[] = [];
  for (let i = 0; i < trees; i++) {
    const s = WORLD_START + (i / trees) * (WORLD_END - WORLD_START), d = basis(s), side = new THREE.Vector3(-d.z, 0, d.x), p = project(s).addScaledVector(side, (i % 2 ? 1 : -1) * (20 + (i * 17 % 65)));
    const ground = groundAt(p.x, p.z);
    matrix.compose(p.clone().setY(ground + 3), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); trunks.setMatrixAt(i, matrix);
    // Several flatter, overlapping clusters give a branching crown silhouette.
    for (let lobe = 0; lobe < 4; lobe++) {
      const angle = i * 2.399963 + lobe * Math.PI * 2 / 3;
      const spread = lobe === 3 ? 0 : 2.1 + (i % 3) * .3;
      const crownPosition = p.clone().add(new THREE.Vector3(Math.cos(angle) * spread, 0, Math.sin(angle) * spread)).setY(ground + 6.4 + (lobe === 3 ? 1.6 : .3 * (i % 3)));
      const crownScale = new THREE.Vector3(2.6 + (i % 3) * .2, 1.4 + (i % 2) * .2, 2.4);
      matrix.compose(crownPosition, new THREE.Quaternion(), crownScale); crowns.setMatrixAt(i * 4 + lobe, matrix);
      crownRest.push({ position: crownPosition, scale: crownScale, phase: angle });
      if (lobe < 3) {
        const from = p.clone().setY(ground + 4.4), delta = crownPosition.clone().sub(from);
        matrix.compose(from.add(crownPosition).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize()), new THREE.Vector3(1, delta.length(), 1));
        branches.setMatrixAt(i * 3 + lobe, matrix);
      }
    }
  }
  trunks.castShadow = true; branches.castShadow = true; crowns.castShadow = true; crowns.receiveShadow = true; scene.add(trunks, branches, crowns);
  const windAxis = new THREE.Vector3(0.42, 0, 0.91).normalize(), windQuaternion = new THREE.Quaternion(), windPosition = new THREE.Vector3();
  /** Lean each crown off the vertical. Trunks stay put; only the canopy moves. */
  function applyWind(time: number) {
    for (let i = 0; i < crownRest.length; i++) {
      const rest = crownRest[i];
      // Two frequencies so the motion never reads as a clean sine.
      const lean = Math.sin(time * 0.9 + rest.phase) * 0.055 + Math.sin(time * 2.3 + rest.phase * 1.7) * 0.018;
      windQuaternion.setFromAxisAngle(windAxis, lean);
      // Leaning about the base, not the centre, so the canopy sways over the trunk.
      windPosition.set(rest.position.x + lean * 2.6, rest.position.y - Math.abs(lean) * 0.8, rest.position.z);
      matrix.compose(windPosition, windQuaternion, rest.scale);
      crowns.setMatrixAt(i, matrix);
    }
    crowns.instanceMatrix.needsUpdate = true;
  }
  // Real Pretoria footprints, not scattered boxes. Falls back to nothing rather
  // than to invented buildings: an empty veld is honest, a fake city is not.
  const city = buildingData ? createBuildings(buildingData, projectLngLat, (material, colour, peak) => emissive.push({ material, colour, peak })) : null;
  if (city) for (const mesh of city.meshes) scene.add(mesh);

  // Streets and the only traffic in the scene.
  const roads = roadData ? createRoads(roadData, projectLngLat, mat('#6f7168'), mat('#cfd3d6')) : null;
  if (roads?.surface) scene.add(roads.surface);
  // Street lighting on the main roads, dark by day, lit by TimeOfDay at night.
  const streetLights = roadData ? createStreetLights(roadData, projectLngLat, mat('#5b625f'), { groundAt }) : null;
  if (streetLights) {
    scene.add(streetLights.group);
    emissive.push({ material: streetLights.lampMaterial, colour: '#ffbf6e', peak: 3 });
    emissive.push({ material: streetLights.poolMaterial, colour: '#ffb45e', peak: 0.55 });
  }
  if (roads?.traffic) scene.add(roads.traffic);
  const station = createStationStudy(); station.root.position.copy(stationAnchor); station.root.rotation.y = stationAngle; emissive.push({ material: station.lampMaterial, colour: '#ffd9a0', peak: 2.4 }); station.root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(station.root);
  // People waiting on the Pretoria platform, facing the track - which is on the
  // station's local -z side, at about z = -26. In the station's own space so they
  // stand on its platform wherever the station is placed. Standing only: the
  // model's sitting clip is a car-seat pose, and on these benches the feet would
  // hang 22 cm off the ground.
  const passengers = personModel
    ? createPassengers(personModel, platformSpots({ xFrom: -84, xTo: 64, z: -15.5, depth: 8, top: 0.45, standing: 14, facing: Math.PI }))
    : null;
  if (passengers) station.root.add(passengers.group);
  for (const [color, transforms] of batches) {
    const instances = new THREE.InstancedMesh(boxGeometry, mat(color), transforms.length);
    transforms.forEach((t, i) => instances.setMatrixAt(i, t));
    // The ground plane is 14 km across - casting from it buys nothing and
    // wastes the whole shadow frustum.
    instances.receiveShadow = true;
    instances.castShadow = color !== GROUND_COLOUR;
    scene.add(instances);
  }
  // Coach glazing: dark by day, warm from inside after dark.
  const trainGlass = glowing('#20343b', '#ffca7a', 1.5);
  const consist = createConsist(locomotive.scene, coach.scene);
  const trains = consist.map((vehicle, index) => {
    const { root, asset } = vehicle;
    model.vehicles[index].length = vehicle.length;
    model.vehicles[index].offset = vehicle.offset;
    asset.traverse(o => { if (o instanceof THREE.Mesh) {
      o.castShadow = true; o.receiveShadow = true;
      const recolor = (m: THREE.Material) => /window|darkblue/i.test(m.name) ? trainGlass
        : mat(/grey|white/i.test(m.name) ? TRAIN_LIVERY.roof : /black|wheel/i.test(m.name) ? TRAIN_LIVERY.underframe : vehicle.color);
      o.material = Array.isArray(o.material) ? o.material.map(recolor) : recolor(o.material);
    }});
    scene.add(root); return root;
  });
  const wheels = new TrainWheels(consist.flatMap(v => v.wheelSlots), mat(TRAIN_LIVERY.underframe));
  scene.add(wheels.mesh);

  const timeOfDay = new TimeOfDay({
    sun, hemisphere, fog: scene.fog as THREE.Fog, renderer, sky,
    emissive,
  });
  const setTime = (key: TimeKey) => { timeOfDay.apply(key); sunOffset = timeOfDay.sunOffset; };
  setTime('day');

  let distance = 0, playing = false, elapsed = 0, last = performance.now(), frame = 0, previousTarget = new THREE.Vector3(), view: 'side' | 'follow' | 'wide' | 'window' = 'side', disposed = false, lastReport = 0;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;
  let travelled = 0, activeSeconds = 0, landmarkUserPaused = false;
  const completedLandmarks = new Set<string>();
  let visit: ReturnType<typeof playStationVisit> | null = null, visitPaused = false, sceneTime = 0;
  const vehiclePoses = model.vehicles.map(() => ({ position: new THREE.Vector3(), angle: 0, pitch: 0 }));
  function updateTrain() {
    model.vehicles.forEach((v, i) => {
      const s = distance - v.offset, bogie = consist[i].halfBogieSpacing;
      const front = project(s + bogie), rear = project(s - bogie), d = front.clone().sub(rear);
      trains[i].position.copy(front.add(rear).multiplyScalar(.5)).y += .58;
      trains[i].rotation.order = 'YXZ';
      trains[i].rotation.y = Math.atan2(-d.z, d.x);
      trains[i].rotation.z = Math.atan2(d.y, Math.hypot(d.x, d.z));
      vehiclePoses[i].position.copy(trains[i].position);
      vehiclePoses[i].angle = trains[i].rotation.y;
      vehiclePoses[i].pitch = trains[i].rotation.z;
    });
    wheels.update(vehiclePoses, distance);
  }
  // The rig is anchored on the locomotive itself - it is the thing the whole
  // experience is meant to be about, so every view is measured from it.
  const ANCHOR_BEHIND = 0;
  /**
   * How far the journey runs. The slice is 6 501 m; stopping at 5 000 left a
   * kilometre and a half of already-built world unreachable.
   */
  const JOURNEY_END = Math.min(6_300, Math.floor(routeLengthMetres) - 120);
  const rideCamera = new RideCamera(camera);
  const passengerWindow = new PassengerWindow();
  let windowLabels = true;
  const passengerCar = trains[model.vehicles.findIndex(v => v.kind !== 'locomotive')];
  let windowPointer: { id: number; x: number; y: number } | null = null;
  const onWindowDown = (event: PointerEvent) => {
    if (view !== 'window' || director.busy || visit) return;
    windowPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const onWindowMove = (event: PointerEvent) => {
    if (!windowPointer || windowPointer.id !== event.pointerId || view !== 'window' || director.busy || visit) return;
    passengerWindow.look((event.clientX - windowPointer.x) / Math.max(1, host.clientWidth), (event.clientY - windowPointer.y) / Math.max(1, host.clientHeight));
    windowPointer.x = event.clientX; windowPointer.y = event.clientY;
  };
  const onWindowUp = () => { windowPointer = null; };
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Train scene. In window view, use arrow keys to look around. Home resets the view.');
  const onWindowKey = (event: KeyboardEvent) => {
    if (view !== 'window' || director.busy || visit) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [.05, 0], ArrowRight: [-.05, 0], ArrowUp: [0, -.05], ArrowDown: [0, .05] };
    if (event.key === 'Home') { passengerWindow.setSide(passengerWindow.side); event.preventDefault(); }
    else if (moves[event.key]) { passengerWindow.look(...moves[event.key]); event.preventDefault(); }
  };
  renderer.domElement.addEventListener('keydown', onWindowKey);
  renderer.domElement.addEventListener('pointerdown', onWindowDown);
  renderer.domElement.addEventListener('pointermove', onWindowMove);
  renderer.domElement.addEventListener('pointerup', onWindowUp);
  renderer.domElement.addEventListener('pointercancel', onWindowUp);
  let speed = 0, userActiveUntil = -Infinity, dragging = false;
  // How long the camera stays where the viewer left it before springing back.
  // The delay is EarthDrive's RESET_DELAY_MS idea (see docs/camera-reference.md).
  const RETURN_DELAY_MS = 1500;
  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('end', () => { dragging = false; userActiveUntil = performance.now() + RETURN_DELAY_MS; });

  // --- Journey: landmarks, triggers and the camera handoff.
  const director = new JourneyDirector(state => journeyChanged({ mode: state.mode, landmark: state.landmark }));
  const LANDMARK_BUILDERS: Record<string, () => ReturnType<typeof createFreedomPark>> = { 'freedom-park': createFreedomPark, 'voortrekker-monument': createVoortrekkerMonument, 'fountains-valley': createFountainsValley };
  for (const definition of landmarkDefinitions) {
    const build = LANDMARK_BUILDERS[definition.scene];
    if (!build) continue;
    const landmarkScene = build();
    landmarkScene.root.position.copy(projectLngLat(definition.location.lon, definition.location.lat));
    // On the pad, not on the pad's sunken surface.
    const base = landmarkBase.get(definition.id);
    if (base !== undefined) landmarkScene.root.position.y = base;
    // Face the rail line, so the authored camera move approaches from the
    // corridor rather than from an arbitrary side.
    const towards = project(definition.alongMetres).sub(landmarkScene.root.position);
    landmarkScene.root.rotation.y = Math.atan2(towards.x, towards.z);
    scene.add(landmarkScene.root);
    director.register(definition, landmarkScene, landmarkScene.root, camera.fov);
  }

  // Overhead line. The route is electrified; without it the consist reads as a
  // model on a table rather than a train on a main line.
  const catenary = createCatenary({ project, basis }, WORLD_START, WORLD_END, mat('#57616a'), mat('#39414a'));
  scene.add(catenary.group);

  // Lineside clutter: troughing, fence, relay huts, km posts and signals.
  const lineside = createLineside({ project, basis }, WORLD_START, WORLD_END, {
    metal: mat('#5a636a'), concrete: mat('#b7b2a4'), cable: mat('#3b4148'),
    lampGreen: glowing('#1f7a42', '#3dff9a', 2.6), lampRed: glowing('#7a1f28', '#ff4a52', 2.6),
  });
  scene.add(lineside.group);

  // Level crossings are found, not placed: wherever a road segment actually
  // intersects the rail centreline, a crossing is built there.
  const crossingLamp = glowing('#4a1216', '#ff2b2b', 3.2);
  // Only where the route data is real. The scene deliberately lays track from
  // -500 m so there is something behind the train at the start, but that stretch
  // is extrapolated off the front of the geometry - and it runs through the
  // densest streets in the slice, which invented three crossings that are not
  // there.
  const railLine: THREE.Vector3[] = [];
  for (let s = 0; s <= WORLD_END; s += 12) railLine.push(project(s));
  // Only roads at grade can cross at grade. A bridge way meeting the line is a
  // bridge, which is exactly what Ben Schoeman Highway got wrong before.
  const atGrade = roadData ? roadData.roads.filter(road => !isGradeSeparated(road)) : [];
  const crossingSites = findCrossings(railLine, atGrade.map(road => ({ points: road.points.map(([lon, lat]) => projectLngLat(lon, lat)), width: road.width })));

  const bridgeSites = roadData
    ? findBridgeSites(railLine, roadData.roads.filter(road => road.bridge).map(road => ({
      points: road.points.map(([lon, lat]) => projectLngLat(lon, lat)), width: road.width, name: road.name,
    })))
    : [];
  const bridges = bridgeSites.length
    ? createBridges(bridgeSites, groundAt, { deck: mat('#6c6e66'), structure: mat('#bdb6a6'), parapet: mat('#d2ccbe') })
    : null;
  if (bridges) scene.add(bridges.group);
  const crossings = crossingSites.length
    ? createLevelCrossings(crossingSites, { deck: mat('#5f6259'), post: mat('#d8d2c4'), cross: mat('#e8e2d4'), lamp: crossingLamp })
    : null;
  if (crossings) scene.add(crossings.group);

  // Ground cover. Bare tinted terrain reads as a golf course from the lineside
  // camera; the Highveld is tussocky.
  const veld = createVegetation({ project, basis }, groundAt, WORLD_START + 100, WORLD_END,
    { grass: mat('#7d8c50'), scrub: mat('#6b7a4d') });
  for (const mesh of veld.meshes) scene.add(mesh);

  // Named places, with a board each and an announcement as the train passes.
  const waypoints = placeData
    ? createWaypoints(placeData, { project, basis }, mat('#6c6f63'), passing, groundAt)
    : null;
  if (waypoints) scene.add(waypoints.group);
  const windowPlaces = createWindowPlaces(host, placeData?.places ?? [], projectLngLat, place => host.dispatchEvent(new CustomEvent('window-place-selected', { detail: place })), [station.root, ...(city?.meshes ?? [])]);

  // Suburban halts - Fonteine and Kloofsig - where OSM records stations along
  // the line. Pretoria itself has its own, more detailed station.
  const halts = placeData
    ? createHalts(selectHalts(placeData.places), { project, basis }, { concrete: mat('#c9c2b0'), structure: mat('#4f5c58'), roof: mat('#6e6a60') })
    : null;
  if (halts) {
    scene.add(halts.group);
    emissive.push({ material: halts.lampMaterial, colour: '#ffd99a', peak: 2.4 });
  }

  // Hadedas: the bird Pretoria's sky actually belongs to.
  const birds = createBirds(mat('#2e2c27'));
  for (const mesh of birds.meshes) scene.add(mesh);

  const sound = new TrainSound();
  /** Any crossing close enough that its lights are running. */
  const nearCrossing = (position: THREE.Vector3) => crossingSites.some(site => site.position.distanceToSquared(position) < 400 * 400);

  const dust = new DustEffect(22); scene.add(dust.mesh);
  // Two contacts per bogie end of the locomotive, offset to the railheads.
  const dustEmitters = () => [-7.75, 7.75].flatMap(along => {
    const p = project(distance + along), d = basis(distance + along), side = new THREE.Vector3(-d.z, 0, d.x);
    return [-1, 1].map(sign => p.clone().addScaledVector(side, sign * 0.72));
  });

  const trackFrame = (s: number) => {
    const forward = basis(s);
    return { forward, side: new THREE.Vector3(-forward.z, 0, forward.x), origin: project(s) };
  };
  /** Signed turn rate over 160 m of rail, roughly -1..1 on this corridor. */
  const curvatureAt = (s: number) => {
    const a = basis(s - 80), b = basis(s + 80);
    return THREE.MathUtils.clamp((a.z * b.x - a.x * b.z) * 10, -1, 1);
  };
  /** The rig pose for the current distance. The station visit flies back to it. */
  const DEFAULT_FOV = 45;
  const poseMatrix = new THREE.Matrix4();
  /** Build a full pose (with orientation and FOV) from a position and a look-at. */
  const toPose = (position: THREE.Vector3, target: THREE.Vector3): CinematicPose => {
    poseMatrix.lookAt(position, target, THREE.Object3D.DEFAULT_UP);
    return { position: position.clone(), target: target.clone(), quaternion: new THREE.Quaternion().setFromRotationMatrix(poseMatrix), fov: DEFAULT_FOV };
  };
  const applyPose = (pose: CinematicPose) => {
    camera.position.copy(pose.position);
    camera.quaternion.copy(pose.quaternion);
    if (Math.abs(camera.fov - pose.fov) > 0.01) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
    // Keep the orbit pivot under the cinematic so handing control back does not
    // snap the view somewhere else.
    controls.target.copy(pose.target);
  };
  /** Where the follow rig wants to be right now, as a full pose. */
  const followPose = () => {
    if (view === 'window') return passengerWindow.pose(passengerCar);
    const frame = trackFrame(distance - ANCHOR_BEHIND);
    const preview = rideCamera.preview(frame, speed, curvatureAt(distance));
    return toPose(preview.position, preview.target);
  };

  function cameraPose() {
    if (view === 'window') return passengerWindow.pose(passengerCar);
    return rideCamera.preview(trackFrame(distance - ANCHOR_BEHIND), speed, curvatureAt(distance));
  }
  function frameCamera() {
    if (view === 'window') { controls.enabled = false; applyPose(passengerWindow.pose(passengerCar)); return; }
    controls.enabled = true; camera.fov = DEFAULT_FOV; camera.updateProjectionMatrix();
    const frame = trackFrame(distance - ANCHOR_BEHIND);
    const target = rideCamera.snap(frame, speed, curvatureAt(distance));
    controls.target.copy(target); previousTarget.copy(target); controls.update();
  }
  // The director is not updated during a station visit, so its last-seen
  // distance goes stale while the train keeps moving. Without a resync, the first
  // frame after the visit sees every landmark it passed as newly crossed and
  // flies the camera kilometres back to one.
  function endVisit() { visit?.stop(); visit = null; visitPaused = false; visitChanged(null); host.dataset.visit = 'none'; director.seek(distance); frameCamera(); }
  const visibility = () => { visit?.pause(document.hidden || visitPaused || reduced); if (document.hidden) sound.update({ speed: 0, distance, nearCrossing: false, paused: true }); };
  document.addEventListener('visibilitychange', visibility);
  const motionChanged = () => { reduced = motionQuery.matches; if (reduced) { playing = false; director.pause(true); } else director.pause(landmarkUserPaused); visibility(); };
  motionQuery.addEventListener('change', motionChanged);
  const resize = () => { renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / Math.max(1, host.clientHeight); camera.updateProjectionMatrix(); };
  // Debug handle for the Playwright harnesses and for inspecting the scene in
  // the console. The plan asks for debug tooling to stay in the build.
  (globalThis as unknown as { __railScene?: unknown }).__railScene = { scene, camera, renderer, sun, trains, controls, sound, director, lineside, timeOfDay, crossings, city, bridges, veld, waypoints, halts, birds, streetLights, passengers };
  const observer = new ResizeObserver(resize); observer.observe(host); resize(); updateTrain(); frameCamera();
  const tick = (now: number) => {
    if (disposed) return; const measuredDelta = (now - last) / 1000, dt = Math.min(.05, measuredDelta); last = now;
    const before = distance;
    if (playing && !document.hidden && !reduced) { elapsed += dt; distance = Math.min(JOURNEY_END, distance + 22 * Math.min(1, elapsed / 4) ** 2 * dt); if (distance === JOURNEY_END) playing = false; }
    if (distance > before) { travelled += distance - before; activeSeconds += dt; }
    speed = dt > 0 ? (distance - before) / dt : 0;
    if (!document.hidden && !reduced) { sceneTime += dt; station.update(sceneTime); dust.update(dustEmitters(), speed, dt); applyWind(sceneTime); sky.update(camera.position, dt); roads?.update(sceneTime); crossings?.update(trains[0].position, sceneTime); birds.update(sceneTime, camera.position, groundAt); passengers?.update(dt); }
    // Outside the motion guard: this is what resolves each signal to one aspect,
    // and without it every signal shows red and green at once.
    lineside.update(distance);
    waypoints?.update(distance);
    sound.update({ speed, distance, dt, paused: !playing || reduced, nearCrossing: nearCrossing(trains[0].position), cameraMode: visit || director.busy ? 'CINEMATIC' : view === 'window' ? 'WINDOW' : view === 'wide' ? 'FREE' : 'FOLLOW', cameraDistanceM: camera.position.distanceTo(view === 'window' ? passengerCar.position : trains[0].position), environment: 'CITY', atStation: distance < 100 });
    updateTrain();
    // Move the sun with the consist rather than the camera: the shadows then
    // stay put relative to the world while the viewer orbits.
    const sunAnchor = project(distance - 60);
    sunTarget.position.copy(sunAnchor);
    sun.position.copy(sunAnchor).add(sunOffset);
    const journey = visit ? null : director.update(distance, document.hidden || reduced ? 0 : dt, followPose(), sceneTime);
    if (journey?.pose) {
      // A landmark owns the frame: the viewer's orbit is suspended, and the
      // train keeps running underneath so the journey never actually stops.
      controls.enabled = false;
      applyPose(journey.pose);
      if (director.finished) { if (journey.landmark) completedLandmarks.add(journey.landmark.id); director.release(journey.pose, followPose); }
      // Keep the rig warm so the return lands on a settled pose, not a lurch.
      // reseat(), not snap(): snap() moves the camera, which would undo the
      // cinematic pose set one line above.
      rideCamera.reseat(trackFrame(distance - ANCHOR_BEHIND), speed, curvatureAt(distance));
      previousTarget.copy(journey.pose.target);
    } else if (!visit && view === 'window') {
      controls.enabled = false; applyPose(passengerWindow.pose(passengerCar));
    } else if (!visit) {
      if (!controls.enabled) { controls.enabled = true; camera.fov = DEFAULT_FOV; camera.updateProjectionMatrix(); }
      const frame = trackFrame(distance - ANCHOR_BEHIND);
      const held = dragging || now < userActiveUntil;
      if (held) {
        // The viewer is looking around: keep their framing, but slide it with
        // the train so the pivot stays on the consist.
        const delta = frame.origin.clone().setY(frame.origin.y + 3).sub(previousTarget);
        camera.position.add(delta); controls.target.add(delta); controls.update();
        previousTarget.copy(frame.origin.clone().setY(frame.origin.y + 3));
        // reseat(), not snap(): snap() moves the camera, which would undo the
        // viewer's drag on every single frame.
        rideCamera.reseat(frame, speed, curvatureAt(distance));
      } else {
        const target = rideCamera.update(frame, speed, curvatureAt(distance), dt, reduced);
        controls.target.copy(target); previousTarget.copy(target); controls.update();
        // After controls.update(), which ends in its own lookAt.
        rideCamera.applySway(dt, speed, reduced);
      }
    }
    windowPlaces.update(camera, windowLabels && view === 'window' && !visit && !director.busy && !document.hidden);
    if (!document.hidden) renderer.render(scene, camera);
    if (now - lastReport > 250) { report(distance, Math.round(1 / Math.max(measuredDelta, .001))); lastReport = now; host.dataset.distance = distance.toFixed(1); host.dataset.journeyEnd = String(JOURNEY_END); host.dataset.drawCalls = String(renderer.info.render.calls); }
    frame = requestAnimationFrame(tick);
  }; frame = requestAnimationFrame(tick);
  return {
    places: placeData?.places ?? [],
    landmarks: landmarkDefinitions,
    journeyEnd: JOURNEY_END,
    get telemetry() { return { speedKph: speed * 3.6, playing, travelled, activeSeconds, completedLandmarks: [...completedLandmarks] }; },
    setQuality(value: 'balanced' | 'light') { renderer.setPixelRatio(value === 'light' ? 1 : Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = value !== 'light'; resize(); },
    play(value: boolean) { playing = value; if (!value) elapsed = 0; },
    seek(value: number) {
      if (visit) endVisit();
      // Scrubbing cancels a running cinematic; otherwise the camera would be
      // somewhere else entirely by the time it handed back.
      if (director.busy) director.cancel();
      distance = Math.max(0, Math.min(JOURNEY_END, value)); playing = false; elapsed = 0; speed = 0;
      director.seek(distance);
      updateTrain(); frameCamera(); report(distance, 0);
    },
    /** Sound must be started from a user gesture; this is that gesture's handler. */
    async setSound(on: boolean) { if (on) await sound.enable(); else sound.disable(); },
    /** Switch the scene between dawn, midday, dusk and night. */
    setTime(key: TimeKey) { setTime(key); },
    /** Play a landmark on demand, for the dev panel and the tourism card. */
    playLandmark(id: string) { if (reduced) return; landmarkUserPaused = false; if (visit) endVisit(); director.playById(id, followPose()); },
    skipLandmark() { landmarkUserPaused = false; if (reduced) { director.cancel(); frameCamera(); } else if (director.busy) director.release(followPose(), followPose); },
    pauseLandmark(value: boolean) { landmarkUserPaused = value; director.pause(value || reduced); },
    view(value: typeof view) { if (visit) endVisit(); view = value; windowPointer = null; if (value !== 'window') rideCamera.setView(value); host.dataset.cameraView = value; frameCamera(); },
    setWindowLabels(value: boolean) { windowLabels = value; },
    windowSide(value: -1 | 1) { passengerWindow.setSide(value); if (view === 'window' && !director.busy && !visit) frameCamera(); },
    visitStation() { if (visit) endVisit(); visitPaused = false; host.dataset.visit = 'station'; visitChanged('Approaching the platform'); visit = playStationVisit(camera, controls, station.root, cameraPose, visitChanged, () => { visit = null; visitChanged(null); host.dataset.visit = 'none'; director.seek(distance); previousTarget.copy(cameraPose().target); }, reduced); },
    pauseVisit(value: boolean) { visitPaused = value; visit?.pause(value || document.hidden || reduced); },
    returnToTrain: endVisit,
    dispose() { motionQuery.removeEventListener('change', motionChanged); renderer.domElement.removeEventListener('keydown', onWindowKey); windowPlaces.dispose(); renderer.domElement.removeEventListener('pointerdown', onWindowDown); renderer.domElement.removeEventListener('pointermove', onWindowMove); renderer.domElement.removeEventListener('pointerup', onWindowUp); renderer.domElement.removeEventListener('pointercancel', onWindowUp); disposed = true; visit?.stop(); director.dispose(); document.removeEventListener('visibilitychange', visibility); cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); dust.dispose(); sky.dispose(); catenary.dispose(); city?.dispose(); wheels.dispose(); lineside.dispose(); roads?.dispose(); crossings?.dispose(); bridges?.dispose(); sound.dispose(); veld.dispose(); waypoints?.dispose(); halts?.dispose(); birds.dispose(); streetLights?.dispose(); passengers?.dispose(); station.dispose(); disposeObject(scene); disposeObject(locomotive.scene); disposeObject(coach.scene); if (personModel) disposeObject(personModel.scene); renderer.dispose(); renderer.domElement.remove(); },
  };
}

