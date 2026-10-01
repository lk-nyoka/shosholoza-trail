import * as THREE from 'three';
import { createConsist } from '../../TrainConsist';
import { TrainWheels, type VehiclePose } from '../../TrainWheels';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createJohannesburgScene, johannesburgMetadata } from './JohannesburgScene';
import { TrainSound } from '../../TrainSound';
import { johannesburgCamera } from './JohannesburgCamera';
import { createJohannesburgSky } from './JohannesburgSky';
import { createCityExplorer } from './CityExplorer';
import { ArrivalMoment } from './ArrivalMoment';
import { createJohannesburgPassengers } from './JohannesburgPassengers';
import { stationMotion, DEPARTURE_START, JOURNEY_END } from './StationMotion';
import { readPreferences, savePreferences } from './Preferences';

const host = document.querySelector<HTMLElement>('#world')!;
const status = document.querySelector<HTMLElement>('#status')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const seek = document.querySelector<HTMLInputElement>('#seek')!;
document.querySelector('#notice')!.textContent = johannesburgMetadata.notice;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionPreference.matches;
let paused = reduced, elapsed = 0, worldTime = 0, tour = !reduced, dead = false, ready = false, night = false, soundWanted = false, dirty = true, renderedFrames = 0;
let suspended = false, shadowDirty = true;
let following = false;
let departing = false;
const arrivalMoment = new ArrivalMoment();
const arrivalCard = document.querySelector<HTMLElement>('#arrival-card')!;
const dismissArrival = () => { arrivalMoment.dismiss(); arrivalCard.hidden = true; };
const sound = new TrainSound();
function persistView() { try { savePreferences(localStorage, { quality: quality.value === 'light' ? 'light' : 'balanced', night }); } catch { /* Storage access can be disabled. */ } }
const scene = new THREE.Scene(); scene.background = new THREE.Color('#aab4be'); scene.fog = new THREE.Fog('#aab4be', 420, 1400);
const camera = new THREE.PerspectiveCamera(48, 1, .2, 2200);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25; host.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .75; controls.minDistance = 4; controls.maxDistance = 1000;
controls.addEventListener('change', () => { dirty = true; });
const city = createJohannesburgScene(); scene.add(city.root);
const sky = createJohannesburgSky(); scene.add(sky.mesh);
const ambient = new THREE.HemisphereLight('#dce6ef', '#79604a', 2.3); scene.add(ambient);
const sun = new THREE.DirectionalLight('#ffe0ad', 3); sun.position.set(-150, 220, -100); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -250, right: 250, top: 200, bottom: -200, near: 1, far: 700 }); sun.shadow.normalBias = .08; scene.add(sun);
const platformLights = [-100, -50, 0, 50].map(x => { const light = new THREE.PointLight('#ffda9b', 0, 45, 2); light.position.set(x, 4.5, 0); scene.add(light); return light; });
const ownedGeometry = new Set<THREE.BufferGeometry>(), ownedMaterial = new Set<THREE.Material>();
let trainWheels: TrainWheels | undefined;
const wheelPoses: VehiclePose[] = [];
function view(position: number[], target: number[]) { camera.position.set(...position as [number, number, number]); controls.target.set(...target as [number, number, number]); controls.update(); }
let audioView: 'STATION' | 'FREE' = 'STATION';
function platform() { audioView = 'STATION'; tour = false; view([18, 3.1, -4.8], [-24, 2.5, 0]); }
view([-275, 5, -4.8], [-325, 2.4, 0]);
let passengers: ReturnType<typeof createJohannesburgPassengers> | undefined;
let passengerSource: THREE.Object3D | undefined;
const loader = new GLTFLoader();
const loading = new AbortController();
async function loadTrain() {
const timeout = window.setTimeout(() => loading.abort(), 45000);
try {
    const assets = await Promise.allSettled([
    loadModel('/assets/models/train/quaternius-electric.glb'),
    loadModel('/assets/models/train/quaternius-passenger.glb'),
  ]);
  if (assets.some(result => result.status === 'rejected')) {
    for (const result of assets) if (result.status === 'fulfilled') disposeModel(result.value.scene);
    throw new Error('Train could not load');
  }
  const [engine, coach] = assets.map(result => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof loadModel>>>).value);
  // Source meshes remain shared; cloned materials support the local livery study.
  const consist = createConsist(engine.scene, coach.scene);
  trainWheels = new TrainWheels(consist.flatMap(v => v.wheelSlots), new THREE.MeshStandardMaterial({ color: '#30373a', roughness: .85 }));
  ownedGeometry.add(trainWheels.mesh.geometry);
  ownedMaterial.add(trainWheels.mesh.material as THREE.Material);
  city.trainRoot.add(trainWheels.mesh);
  trainWheels.mesh.name = 'shared-train-wheels';
  for (const [i, vehicle] of consist.entries()) {
    const model = vehicle.asset, carriage = vehicle.root;
    carriage.position.set(-vehicle.offset, .65, 0); city.trainRoot.add(carriage);
    wheelPoses.push({ position: carriage.position.clone(), angle: 0 });
    const tint = new THREE.Color(vehicle.color);
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      ownedGeometry.add(o.geometry); o.castShadow = true; o.receiveShadow = true;
      const change = (original: THREE.Material) => {
        const m = original.clone() as THREE.MeshStandardMaterial; ownedMaterial.add(m);
        if (/blue|green|red/i.test(m.name)) m.color.copy(tint);
        if (/window/i.test(m.name)) { m.color.set('#263f50'); m.emissive.set('#dbc194'); m.emissiveIntensity = .12 + (i * 7 % 5) * .05; }
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(change) : change(o.material);
    });
  }
  // Dispose unused original materials; geometries are shared with the displayed clones.
  for (const source of [engine.scene, coach.scene]) source.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
  ready = true; dirty = shadowDirty = true;
} catch (error) {
  if (dead) return;
  const panel = document.querySelector<HTMLElement>('#error')!; panel.hidden = false;
  panel.textContent = 'The local train assets could not load. The city is still available to inspect. Reload to retry.';
  status.textContent = 'Train unavailable';
} finally { window.clearTimeout(timeout); }
}
async function loadModel(url: string) {
  const response = await fetch(url, { signal: loading.signal });
  if (!response.ok) throw new Error('Train asset request failed');
  const asset = await loader.parseAsync(await response.arrayBuffer(), '/assets/models/train/');
  if (dead || loading.signal.aborted) {
    disposeModel(asset.scene);
    throw new Error('Scene closed');
  }
  return asset;
}
function disposeModel(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
  });
  textures.forEach(texture => texture.dispose());
}
async function loadPassengers() {
  try {
    const source = await loadModel('/assets/models/people/boxman.glb');
    if (dead) { disposeModel(source.scene); return; }
    passengerSource = source.scene; passengers = createJohannesburgPassengers(source);
    passengers.setLightweight(quality.value === 'light'); city.root.add(passengers.group);
    passengers.update(.001); city.setFallbackPassengers(false); dirty = shadowDirty = true;
  } catch { /* Existing local figures remain if this optional model is unavailable. */ }
}
function syncPlay() { dirty = shadowDirty = true; play.textContent = paused ? 'Play' : 'Pause'; play.setAttribute('aria-pressed', String(!paused)); }
syncPlay();
async function syncSound() {
  if (soundWanted && !paused && !document.hidden && !dead && !suspended) {
    try { await sound.enable(); if (dead || paused || document.hidden || !soundWanted || suspended) sound.disable(); }
    catch { soundWanted = false; soundButton.textContent = 'Sound unavailable'; soundButton.setAttribute('aria-pressed', 'false'); }
  } else sound.disable();
}
const soundButton = document.querySelector<HTMLButtonElement>('#sound')!;
soundButton.onclick = () => { soundWanted = !soundWanted; soundButton.textContent = soundWanted ? 'Sound on' : 'Sound off'; soundButton.setAttribute('aria-pressed', String(soundWanted)); void syncSound(); };
const onVisibility = () => { previous = performance.now(); void syncSound(); };
document.addEventListener('visibilitychange', onVisibility);
play.onclick = () => { paused = !paused; syncPlay(); void syncSound(); };
document.querySelector<HTMLButtonElement>('#restart')!.onclick = () => { elapsed = worldTime = 0; paused = reduced; tour = !reduced; syncPlay(); void syncSound(); };
document.querySelector<HTMLButtonElement>('#lighting')!.onclick = event => {
  night = !night;
  dirty = true;
  const button = event.currentTarget as HTMLButtonElement; button.textContent = night ? 'Daylight' : 'Dusk lighting'; button.setAttribute('aria-pressed', String(night));
  (scene.background as THREE.Color).set(night ? '#26364f' : '#aab4be'); (scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color);
  ambient.intensity = night ? 1.15 : 2.3; ambient.color.set(night ? '#829ac8' : '#dce6ef'); sun.intensity = night ? .35 : 3;
  sun.color.set(night ? '#a7beed' : '#ffe0ad'); city.setNight(night); sky.setNight(night);
  platformLights.forEach(light => { light.intensity = night ? 100 : 0; });
  persistView();
};
document.querySelector<HTMLButtonElement>('#platform')!.onclick = platform;
document.querySelector<HTMLButtonElement>('#skyline')!.onclick = () => { audioView = 'FREE'; tour = false; view([-245, 92, -185], [0, 32, 130]); };
document.querySelector<HTMLButtonElement>('#street')!.onclick = () => { audioView = 'FREE'; tour = false; view([-80, 2.4, 77], [35, 15, 135]); };
document.querySelector<HTMLButtonElement>('#concourse')!.onclick = () => { audioView = 'STATION'; tour = false; view([176, 10.1, 12], [65, 4.2, 0]); };
const explorer = createCityExplorer(document.body, id => document.getElementById(id)?.click());
for (const id of ['platform', 'skyline', 'street', 'concourse']) document.getElementById(id)!.addEventListener('click', () => explorer.show(id));
for (const id of ['platform', 'skyline', 'street', 'concourse', 'restart', 'tour']) document.getElementById(id)!.addEventListener('click', () => { following = false; dismissArrival(); document.getElementById('follow')!.setAttribute('aria-pressed', 'false'); });
document.getElementById('follow')!.onclick = () => { following = true; tour = false; explorer.clear(); dismissArrival(); dirty = true; document.getElementById('follow')!.setAttribute('aria-pressed', 'true'); };
document.getElementById('arrival-explore')!.onclick = () => { dismissArrival(); document.getElementById('street')!.click(); };
document.getElementById('arrival-dismiss')!.onclick = dismissArrival;
const placesButton = document.querySelector<HTMLButtonElement>('#places')!;
const departButton = document.querySelector<HTMLButtonElement>('#depart')!;
departButton.onclick = () => {
  if (!ready || elapsed < 24 || departing) return;
  departing = true; elapsed = DEPARTURE_START; tour = false; following = !reduced;
  paused = reduced; explorer.clear(); dismissArrival(); syncPlay(); void syncSound();
  document.getElementById('follow')!.setAttribute('aria-pressed', String(following));
};
for (const id of ['restart', 'tour']) document.getElementById(id)!.addEventListener('click', () => { departing = false; });
placesButton.onclick = () => { placesButton.setAttribute('aria-pressed', String(explorer.toggle())); dirty = true; };
for (const id of ['restart', 'tour']) document.getElementById(id)!.addEventListener('click', () => explorer.clear());
const quality = document.querySelector<HTMLSelectElement>('#quality')!;
quality.onchange = () => { const light = quality.value === 'light'; renderer.setPixelRatio(light ? 1 : Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = !light; passengers?.setLightweight(light); resize(); shadowDirty = true; persistView(); };
const onMotion = () => { reduced = motionPreference.matches; if (reduced) { paused = true; tour = false; syncPlay(); void syncSound(); } };
motionPreference.addEventListener('change', onMotion);
document.querySelector<HTMLButtonElement>('#tour')!.onclick = () => { elapsed = worldTime = 0; tour = !reduced; paused = reduced; if (reduced) platform(); syncPlay(); void syncSound(); };
seek.oninput = () => { elapsed = worldTime = Number(seek.value); departing = elapsed > DEPARTURE_START; if (departing) { tour = false; dismissArrival(); } dirty = shadowDirty = true; };
controls.addEventListener('start', () => { tour = following = false; document.getElementById('follow')!.setAttribute('aria-pressed', 'false'); });
function resize() { renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); dirty = true; }
const observer = new ResizeObserver(resize); observer.observe(host); resize();
try {
  const saved = readPreferences(localStorage);
  quality.value = saved.quality;
  quality.dispatchEvent(new Event('change'));
  if (saved.night) document.getElementById('lighting')!.click();
} catch { /* Default view remains available without storage. */ }
let previous = performance.now();
function frame(now: number) {
  if (dead) return;
  const dt = Math.min((now - previous) / 1000, .1); previous = now;
  if (!document.hidden && !suspended) {
    // Let manual orbit settle, then stop issuing WebGL work while paused.
    controls.update();
    if (camera.position.y < 1.3) { camera.position.y = 1.3; camera.lookAt(controls.target); dirty = true; }
    if (paused && !dirty) { requestAnimationFrame(frame); return; }
    if (!paused) { if (ready) elapsed = Math.min(departing ? JOURNEY_END : DEPARTURE_START, elapsed + dt); worldTime += dt; shadowDirty = true; }
    city.update(elapsed, worldTime); if (!paused) passengers?.update(dt); seek.value = String(elapsed);
    const motion = stationMotion(elapsed);
    city.trainRoot.position.x = motion.x;
    departButton.disabled = !ready || elapsed < 24 || departing;
    const arrival = arrivalMoment.update(elapsed);
    if (arrival.hide) arrivalCard.hidden = true;
    else if (arrival.show && ready && !departing) { explorer.clear(); arrivalCard.hidden = false; }
    trainWheels?.update(wheelPoses, motion.x + 340);
    const speed = paused || !ready || motion.phase === 'complete' ? 0 : motion.speed;
    sound.update({ speed, dt, distance: motion.x + 340, nearCrossing: false, paused: paused || !ready || motion.phase === 'complete', cameraMode: tour ? 'CINEMATIC' : following ? 'FOLLOW' : audioView, cameraDistanceM: camera.position.distanceTo(city.trainRoot.position), environment: Math.abs(motion.x) < 160 ? 'STATION' : 'CITY', atStation: motion.phase === 'dwell' });
    if (tour) {
      const pose = johannesburgCamera(elapsed); view(pose.position, pose.target);
    }
    if (following) { const x = motion.x; view([x + 25, 3.2, -4.8], [x - 20, 2.5, 0]); }
    controls.update(); sky.mesh.position.copy(camera.position); renderer.shadowMap.needsUpdate = shadowDirty; renderer.render(scene, camera); explorer.update(camera, host.clientWidth, host.clientHeight); renderedFrames++; dirty = shadowDirty = false;
    if (ready) status.textContent = motion.phase === 'arriving' ? 'Approaching Park Station' : motion.phase === 'departing' ? 'Leaving the station' : motion.phase === 'complete' ? 'Departure preview complete · replay or explore' : 'Arrived · explore the city';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function dispose() { if (dead) return; dead = true; loading.abort(); window.removeEventListener('pagehide', onHide); window.removeEventListener('pageshow', onShow); motionPreference.removeEventListener('change', onMotion); document.removeEventListener('visibilitychange', onVisibility); sound.dispose(); passengers?.dispose(); if (passengerSource) disposeModel(passengerSource); explorer.dispose(); observer.disconnect(); controls.dispose(); city.dispose(); sky.dispose(); ownedGeometry.forEach(g => g.dispose()); ownedMaterial.forEach(m => m.dispose()); sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove(); }
function onHide(event: PageTransitionEvent) { if (event.persisted) { suspended = true; sound.disable(); } else dispose(); }
function onShow(event: PageTransitionEvent) { if (event.persisted && !dead) { suspended = false; previous = performance.now(); dirty = true; void syncSound(); } }
window.addEventListener('pagehide', onHide); window.addEventListener('pageshow', onShow);
// Explicit preview inspection surface, independent of the production application's state.
Object.assign(window, { __johannesburg: { city, renderer, camera, sound, dispose, get time() { return elapsed; }, get worldTime() { return worldTime; }, get soundOn() { return sound.on; }, get renderedFrames() { return renderedFrames; } } });

void loadTrain();
void loadPassengers();
