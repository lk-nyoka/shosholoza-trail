// Beaufort West chapter: renderer, story director and interaction.
//
// Three modes, as the Beaufort West plan asks: Story (guided beats), Explore
// (free orbit, story held), and Home (always back to the town). Click any
// landmark for its source and confidence.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createBeaufortWestScene, loadBeaufortWestData, type BeaufortWestWorld, type Shot, type TownLandmark } from './BeaufortWestScene.js';
import { BEATS, TIMELINE, WILDLIFE_NOTICE, eventsFor, type Beat, type TimelineEvent } from './story.js';
import { createConsist } from '../../TrainConsist.js';
import { TrainSound } from '../../TrainSound.js';
import { SkyDome, SKY } from '../../SkyDome.js';
import { TimeOfDay, TIME_PRESETS, type TimeKey } from '../../TimeOfDay.js';
import { RideCamera } from '../../RideCamera.js';
import { TRAIN_LIVERY } from '../../../train-model.js';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const host = $('#world'), statusEl = $('#status'), phaseEl = $('#phase');
const playBtn = $<HTMLButtonElement>('#play'), pauseBtn = $<HTMLButtonElement>('#pause'), exploreBtn = $<HTMLButtonElement>('#explore');
const homeBtn = $<HTMLButtonElement>('#home'), soundBtn = $<HTMLButtonElement>('#sound'), timeSelect = $<HTMLSelectElement>('#time');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// -------------------------------------------------------------------------
// Renderer, sky and light.
// -------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(`#${SKY.horizon.getHexString()}`, 2000, 12000);
const sky = new SkyDome();
// Above the Nuweveld, not below it: the escarpment tops out ~1 km over the rail.
sky.cloudLift = 1500;
scene.add(sky.group);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 24000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
host.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 3;
controls.maxDistance = 9000;

const hemisphere = new THREE.HemisphereLight('#fff4de', '#6f604e', 1.6);
const sun = new THREE.DirectionalLight('#fff1db', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near: 20, far: 1200, left: -300, right: 300, top: 300, bottom: -300 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
const sunTarget = new THREE.Object3D();
sun.target = sunTarget;
scene.add(hemisphere, sun, sunTarget);

statusEl.textContent = 'Loading Karoo terrain, rail and town…';
let bw: BeaufortWestWorld;
try {
  bw = createBeaufortWestScene(await loadBeaufortWestData());
} catch (error) {
  statusEl.textContent = `Beaufort West could not load: ${String(error)}`;
  throw error;
}
scene.add(bw.root);

const timeOfDay = new TimeOfDay({ sun, hemisphere, fog: scene.fog as THREE.Fog, renderer, sky, emissive: bw.emissive });
let sunOffset = new THREE.Vector3();
function setTime(key: TimeKey) {
  timeOfDay.apply(key);
  // Karoo air: the plan's "vast sky and atmospheric depth". The corridor's
  // fog would swallow the Nuweveld escarpment ten kilometres away.
  const fog = scene.fog as THREE.Fog;
  fog.near = TIME_PRESETS[key].fogNear * 3;
  fog.far = TIME_PRESETS[key].fogFar * 4.5;
  sunOffset = timeOfDay.sunOffset.multiplyScalar(2);
  bw.setDarkness(TIME_PRESETS[key].darkness);
  timeSelect.value = key;
}
setTime('day');

// -------------------------------------------------------------------------
// Camera: tweens, the chase rig, and free exploration.
// -------------------------------------------------------------------------
let tween: { from: Shot; to: Shot; start: number; ms: number; done: () => void } | null = null;
function shot(to: Shot, ms = 1200) {
  following = false;
  cameraOwner++;
  if (ms <= 0 || reducedMotion) {
    tween = null;
    camera.position.copy(to.position); controls.target.copy(to.target); controls.update();
    return Promise.resolve();
  }
  return new Promise<void>(done => {
    tween?.done();
    tween = { from: { position: camera.position.clone(), target: controls.target.clone() }, to, start: performance.now(), ms, done };
  });
}
const rideCamera = new RideCamera(camera);
rideCamera.setView('side');
let following = false;
const chaseFrame = () => { const f = bw.railFrame(train.x); return { origin: f.origin, forward: f.forward, side: f.side.clone().negate() }; };
/** Bumped by every camera move, so a superseded follow() cannot take the camera back. */
let cameraOwner = 0;
function follow() {
  rideCamera.reseat(chaseFrame(), train.speed, 0);
  const pose = rideCamera.preview(chaseFrame(), train.speed, 0);
  const move = shot({ position: pose.position, target: pose.target }, 900);
  const mine = cameraOwner;
  return move.then(() => { if (mine === cameraOwner && !exploring) following = true; });
}

// -------------------------------------------------------------------------
// Train: runs in, brakes to stop at the platform, waits to be sent on.
// -------------------------------------------------------------------------
const BRAKING = 0.75;
const blockhouseX = bw.shots.blockhouseX();
const START_X = Math.min(bw.trainRange.max - 450, Math.max(900, blockhouseX + 520));
const train = { x: START_X, speed: 25, target: 25, stopPending: true, standing: false, released: false };
function resetTrain() {
  Object.assign(train, { x: START_X, speed: 25, target: 25, stopPending: true, standing: false, released: false });
  bw.setTrainDistance(train.x);
}
function stepTrain(dt: number) {
  if (train.standing && !train.released) { train.speed = 0; return; }
  let target = train.target;
  if (train.stopPending) target = Math.min(Math.max(target, 6), Math.sqrt(2 * BRAKING * Math.max(0, train.x)));
  if (train.x < bw.trainRange.min + 250) target = Math.min(target, Math.sqrt(2 * BRAKING * Math.max(0, train.x - bw.trainRange.min)));
  const rate = target < train.speed ? 1.2 : 0.45;
  train.speed += Math.sign(target - train.speed) * Math.min(Math.abs(target - train.speed), rate * dt);
  train.x -= train.speed * dt;
  if (train.stopPending && train.x <= 0.05) {
    Object.assign(train, { x: 0, speed: 0, stopPending: false, standing: true });
  }
}

async function loadTrain() {
  const loader = new GLTFLoader();
  const [engine, coach] = await Promise.all([
    loader.loadAsync('/assets/models/train/quaternius-electric.glb'),
    loader.loadAsync('/assets/models/train/quaternius-passenger.glb'),
  ]);
  const consist = createConsist(engine.scene, coach.scene);
  const paints = new Map<string, THREE.MeshStandardMaterial>();
  const paint = (colour: string) => { if (!paints.has(colour)) paints.set(colour, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6 })); return paints.get(colour)!; };
  const glass = new THREE.MeshStandardMaterial({ color: '#20343b', roughness: 0.3 });
  bw.emissive.push({ material: glass, colour: '#ffca7a', peak: 1.5 });
  for (const vehicle of consist) vehicle.asset.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true; o.receiveShadow = true;
    const recolour = (m: THREE.Material) => /window|darkblue/i.test(m.name) ? glass
      : paint(/grey|white/i.test(m.name) ? TRAIN_LIVERY.roof : /black|wheel/i.test(m.name) ? TRAIN_LIVERY.underframe : vehicle.color);
    o.material = Array.isArray(o.material) ? o.material.map(recolour) : recolour(o.material);
  });
  bw.attachTrain(consist, paint(TRAIN_LIVERY.underframe));
  bw.setTrainDistance(train.x);
  setTime(timeOfDay.preset.key);
}

// -------------------------------------------------------------------------
// Story UI.
// -------------------------------------------------------------------------
const card = $('#story-card'), notice = $('#notice');
// Lay the overlays out above the controls as they actually wrap, not at guessed heights.
const measure = new ResizeObserver(() => {
  document.body.style.setProperty('--footer-h', `${$('footer').offsetHeight}px`);
  document.body.style.setProperty('--timeline-h', `${$('#timeline').offsetHeight}px`);
});
measure.observe($('footer'));
measure.observe($('#timeline'));
const timelineButtons = new Map<number, HTMLButtonElement>();
for (const event of TIMELINE) {
  const button = document.createElement('button');
  button.textContent = String(event.year);
  button.setAttribute('aria-label', `${event.year}: ${event.title}`);
  button.onclick = () => showCard(event.title, event.body, [event], `${event.year}`);
  $('#timeline').append(button);
  timelineButtons.set(event.year, button);
}
function showCard(title: string, body: string, events: TimelineEvent[], kicker = 'Beaufort West') {
  $('#story-kicker').textContent = kicker;
  $('#story-title').textContent = title;
  $('#story-body').textContent = body;
  $('#story-events').replaceChildren(...events.map(event => {
    const li = document.createElement('li');
    const year = document.createElement('b'); year.textContent = `${event.year} · ${event.title}. `;
    const source = document.createElement('span'); source.className = 'source'; source.textContent = `${event.source} · ${event.confidence}`;
    li.append(year, event.body, source);
    return li;
  }));
  card.classList.add('shown');
}
function light(years: number[]) {
  for (const [year, button] of timelineButtons) button.classList.toggle('lit', years.includes(year));
}
function showNotice(text: string | null) {
  notice.textContent = text ?? '';
  notice.classList.toggle('shown', Boolean(text));
}
const cinematic = (on: boolean) => document.body.classList.toggle('cinematic', on);

// Landmark inspector, by click or by the picker.
const inspector = $('#inspector');
let inspectorOpener: HTMLElement | null = null;
renderer.domElement.tabIndex = -1;
function inspect(landmark: TownLandmark) {
  if (inspector.hidden) inspectorOpener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const kinds: Record<TownLandmark['kind'], string> = { church: 'Church', chapel: 'Church', museum: 'Museum', blockhouse: 'Anglo-Boer War fortification', 'park-gate': 'National park' };
  $('#inspector-kind').textContent = kinds[landmark.kind];
  $('#inspector-title').textContent = landmark.name;
  $('#inspector-note').textContent = landmark.note;
  $('#inspector-source').textContent = landmark.source;
  $('#inspector-confidence').textContent = landmark.confidence;
  $('#inspector-date').textContent = landmark.startDate ?? 'Not recorded';
  inspector.hidden = false;
  $<HTMLButtonElement>('#inspector-close').focus();
}
$('#inspector-close').onclick = () => { inspector.hidden = true; (inspectorOpener ?? renderer.domElement).focus(); };
addEventListener('keydown', event => { if (event.key === 'Escape' && !inspector.hidden) $('#inspector-close').click(); });
const picker = document.createElement('select');
picker.setAttribute('aria-label', 'Go to landmark');
picker.append(new Option('Landmarks…', ''), ...bw.landmarks.map((l, i) => new Option(l.title, String(i))));
const pickerLabel = document.createElement('label');
pickerLabel.append('Go to', picker);
soundBtn.after(pickerLabel);
picker.onchange = () => {
  const landmark = bw.landmarks[Number(picker.value)];
  const root = bw.landmarkRoots.find(r => r.userData.landmark === landmark);
  picker.value = '';
  if (!landmark || !root) return;
  setExplore(true);
  const at = root.getWorldPosition(new THREE.Vector3());
  const back = camera.position.clone().sub(at).setY(0).normalize();
  const radius = landmark.kind === 'park-gate' ? 60 : landmark.kind === 'church' ? 90 : 45;
  void shot({ position: at.clone().addScaledVector(back, radius).setY(at.y + radius * 0.45), target: at.clone().setY(at.y + 6) }, 1400);
  inspect(landmark);
};
const raycaster = new THREE.Raycaster();
let down: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
  const hit = raycaster.intersectObjects(bw.landmarkRoots, true)[0];
  let object: THREE.Object3D | null = hit?.object ?? null;
  while (object && !object.userData.landmark) object = object.parent;
  if (object) inspect(object.userData.landmark as TownLandmark);
});

// -------------------------------------------------------------------------
// The story director.
// -------------------------------------------------------------------------
let paused = false, exploring = false, running = false, runId = 0;
/** Wait `ms` of story time: holds while paused or exploring, ends early if the run is cancelled. */
async function hold(ms: number, id: number) {
  let left = ms, last = performance.now();
  while (left > 0 && id === runId) {
    await new Promise(r => setTimeout(r, 100));
    const now = performance.now();
    if (!paused && !exploring) left -= now - last;
    last = now;
  }
  return id === runId;
}
/** Wait for a condition; the timeout, like hold(), counts only story time. */
async function until(test: () => boolean, id: number, timeoutMs = 60000) {
  let waited = 0, last = performance.now();
  while (id === runId && !test() && waited < timeoutMs) {
    await new Promise(r => setTimeout(r, 100));
    const now = performance.now();
    if (!paused && !exploring) waited += now - last;
    last = now;
  }
  return id === runId;
}
/**
 * A story camera move. Held while the viewer explores: the explorer's own
 * moves (picker, Home, orbit) must not be overridden by the next beat.
 */
async function cue(to: () => Shot, ms: number, id: number) {
  await until(() => !exploring, id, Infinity);
  if (id === runId) await shot(to(), ms);
}
function enter(beat: Beat, index: number) {
  phaseEl.textContent = beat.phase;
  $('#progress').style.width = `${((index + 1) / BEATS.length) * 100}%`;
  showCard(beat.title, beat.body, eventsFor(beat));
  light(beat.years);
  showNotice(null);
}

async function runStory() {
  const id = ++runId;
  running = true;
  playBtn.textContent = 'Story running…';
  playBtn.disabled = true;
  resetTrain();
  setTime('day');
  setExplore(false);
  const beat = (id: string) => BEATS.findIndex(b => b.id === id);
  const go = (name: string) => enter(BEATS[beat(name)], beat(name));
  try {
    go('approach');
    cinematic(false);
    await cue(() => bw.shots.opening(), 0, id);
    if (!await hold(2600, id)) return;
    await follow();
    if (!await until(() => train.x <= blockhouseX + 160, id)) return;

    go('blockhouse');
    await cue(() => bw.shots.blockhouse(), 700, id);
    if (!await until(() => train.x <= blockhouseX - 260, id, 30000)) return;
    if (!await hold(800, id)) return;

    go('arrival');
    cinematic(true);
    for (let i = 0; i <= 40 && train.x > 1 && id === runId; i++) {
      void cue(() => bw.shots.arrivalTrack(Math.min(1, 1 - train.x / 450)), 180, id);
      await hold(180, id);
    }
    if (!await until(() => train.standing, id)) return;
    await cue(() => bw.shots.arrivalWide(), 1600, id);
    if (!await hold(BEATS[beat('arrival')].holdMs, id)) return;

    go('church');
    await cue(() => bw.shots.church(0), 2200, id);
    for (let i = 1; i <= 30 && id === runId; i++) { void cue(() => bw.shots.church(i / 30), 200, id); await hold(200, id); }

    go('museum');
    await cue(() => bw.shots.museum(), 2000, id);
    if (!await hold(BEATS[beat('museum')].holdMs, id)) return;

    go('karoo');
    await cue(() => bw.shots.townAerial(), 2400, id);
    await cue(() => bw.shots.karoo(0), 2600, id);
    for (let i = 1; i <= 25 && id === runId; i++) { void cue(() => bw.shots.karoo(i / 25), 200, id); await hold(200, id); }

    go('wildlife');
    showNotice(WILDLIFE_NOTICE);
    await cue(() => bw.shots.wildlife(), 2400, id);
    if (!await hold(BEATS[beat('wildlife')].holdMs, id)) return;

    go('night');
    setTime('night');
    await cue(() => bw.shots.night(), 2000, id);
    if (!await hold(BEATS[beat('night')].holdMs, id)) return;

    go('departure');
    setTime('dawn');
    cinematic(false);
    await follow();
    train.released = true;
    train.target = 17;
    if (!await hold(BEATS[beat('departure')].holdMs, id)) return;
    phaseEl.textContent = 'Complete';
    const stamp = $('#stamp');
    stamp.hidden = false;
    $<HTMLButtonElement>('#stamp-close').focus();
    statusEl.textContent = 'Beaufort West complete · stamp collected';
  } finally {
    if (id === runId) {
      running = false;
      playBtn.disabled = false;
      playBtn.textContent = '▶ Play story';
    }
  }
}
$('#stamp-close').onclick = () => { $('#stamp').hidden = true; playBtn.focus(); };
$('#stamp').addEventListener('keydown', event => {
  if (event.key === 'Escape') $('#stamp-close').click();
  // One control inside: keep focus on it while the stamp is up.
  if (event.key === 'Tab') { event.preventDefault(); $('#stamp-close').focus(); }
});

playBtn.onclick = () => { if (!running) void runStory(); };
pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  pauseBtn.setAttribute('aria-pressed', String(paused));
};
function setExplore(on: boolean) {
  exploring = on;
  exploreBtn.setAttribute('aria-pressed', String(on));
  if (on) { following = false; tween?.done(); tween = null; cinematic(false); }
  statusEl.textContent = on ? 'Explore: drag to orbit, scroll to zoom. Click a landmark for details.' : running ? 'Story running' : 'Ready';
}
exploreBtn.onclick = () => {
  setExplore(!exploring);
  if (!exploring && running && train.standing === false) void follow();
};
homeBtn.onclick = () => { setExplore(true); void shot(bw.shots.townAerial(), 1400); };
timeSelect.onchange = () => setTime(timeSelect.value as TimeKey);
const sound = new TrainSound();
let soundOn = false;
soundBtn.onclick = () => {
  soundOn = !soundOn;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
  if (soundOn) sound.enable(); else sound.disable();
};

// -------------------------------------------------------------------------
// Frame loop.
// -------------------------------------------------------------------------
let last = performance.now(), time = 0, frames = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  // Real time, capped: slow frames should not slow the story.
  const dt = Math.min((now - last) / 1000, 0.5);
  last = now;
  frames++;
  if (!paused) {
    time += dt;
    stepTrain(dt);
    bw.setTrainDistance(train.x);
    if (tween) {
      const t = Math.min(1, (now - tween.start) / tween.ms), e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      camera.position.lerpVectors(tween.from.position, tween.to.position, e);
      controls.target.lerpVectors(tween.from.target, tween.to.target, e);
      if (t >= 1) { const done = tween.done; tween = null; done(); }
    }
    if (soundOn) sound.update({
      speed: train.speed, dt, distance: -train.x, nearCrossing: false, paused,
      cameraMode: following ? 'FOLLOW' : 'CINEMATIC', cameraDistanceM: camera.position.distanceTo(bw.railFrame(train.x).origin),
      environment: Math.abs(train.x) < 300 ? 'STATION' : 'OPEN', atStation: train.speed < 0.2,
    });
    // Reduced motion still places the herds and dust, just holds them still.
    bw.update(reducedMotion ? 0 : time, reducedMotion ? 0 : dt, camera);
    sky.update(camera.position, dt);
  }
  if (following && !paused && !exploring) controls.target.copy(rideCamera.update(chaseFrame(), train.speed, 0, dt, reducedMotion));
  else controls.update();
  // Never under the ground: shots are authored from landmark and track
  // heights, and the Karoo is rarely as flat as it looks.
  const floor = bw.groundAtWorld(camera.position.x, camera.position.z) + 2;
  if (camera.position.y < floor) { camera.position.y = floor; camera.lookAt(controls.target); }
  if (following && !paused && !exploring) rideCamera.applySway(dt, train.speed, reducedMotion);
  sunTarget.position.copy(controls.target);
  sun.position.copy(controls.target).add(sunOffset);
  renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

await shot(bw.shots.opening(), 0);
requestAnimationFrame(frame);
try {
  await loadTrain();
  statusEl.textContent = 'Beaufort West ready · Play the story or Explore';
} catch (error) {
  console.warn('[Beaufort West] Train models unavailable:', error);
  statusEl.textContent = 'Beaufort West ready (no train models)';
}
playBtn.disabled = false;
showCard('Beaufort West', 'The oldest municipality in South Africa, under the Nuweveld mountains on the Karoo main line. Play the story, or explore and click a landmark.', []);
(globalThis as unknown as { __beaufortWest?: unknown }).__beaufortWest = { bw, train, camera, controls, renderer, scene, raycaster, sun, hemisphere, setTime, get frames() { return frames; }, get phase() { return phaseEl.textContent; } };
