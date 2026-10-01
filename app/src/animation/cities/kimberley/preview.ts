import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createKimberleyScene, loadKimberleyData, type KimberleyWorld, type Shot } from './KimberleyScene.js';
import { createConsist } from '../../TrainConsist.js';
import { TrainSound } from '../../TrainSound.js';
import { SkyDome, SKY } from '../../SkyDome.js';
import { TimeOfDay, type TimeKey } from '../../TimeOfDay.js';
import { RideCamera } from '../../RideCamera.js';
import { TRAIN_LIVERY } from '../../../train-model.js';
import { createKimberleyThreeAdapters, type ChapterAudioState } from '../../../kimberley/KimberleyThreeAdapters.js';
import { KimberleyChapterController } from '../../../kimberley/kimberley/KimberleyChapterController.js';

const host = document.querySelector<HTMLElement>('#world')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const runChapterBtn = document.querySelector<HTMLButtonElement>('#btn-run-chapter')!;
const pauseBtn = document.querySelector<HTMLButtonElement>('#btn-pause')!;
const restartBtn = document.querySelector<HTMLButtonElement>('#btn-restart')!;
const soundBtn = document.querySelector<HTMLButtonElement>('#btn-sound')!;
runChapterBtn.disabled = true;

// -------------------------------------------------------------
// 1. RENDERER, SKY AND LIGHT - the same systems as the Pretoria scene.
// -------------------------------------------------------------
const scene = new THREE.Scene();
const horizon = `#${SKY.horizon.getHexString()}`;
scene.fog = new THREE.Fog(horizon, 900, 3400);
const sky = new SkyDome();
scene.add(sky.group);

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 6000); // beyond the sky dome (radius 5200), or it clips to the clear colour
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 3;
controls.maxDistance = 1800;

const hemisphere = new THREE.HemisphereLight('#fdebd2', '#7b5c40', 1.6);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight('#ffe3b5', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 900;
const d = 260;
sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun);
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sun.target = sunTarget;

// -------------------------------------------------------------
// 2. KIMBERLEY, FROM REAL DATA
// -------------------------------------------------------------
statusEl.textContent = 'Loading Kimberley terrain, rail and town…';
let kimberley: KimberleyWorld;
try {
  kimberley = createKimberleyScene(await loadKimberleyData());
} catch (error) {
  statusEl.textContent = `Kimberley could not load: ${String(error)}`;
  throw error;
}
scene.add(kimberley.root);

const timeOfDay = new TimeOfDay({ sun, hemisphere, fog: scene.fog as THREE.Fog, renderer, sky, emissive: kimberley.emissive });
let sunOffset = new THREE.Vector3();
function setTimeOfDay(key: TimeKey) {
  timeOfDay.apply(key);
  sunOffset = timeOfDay.sunOffset;
}
setTimeOfDay('day');

// -------------------------------------------------------------
// 3. CAMERA: cinematic tweens, or the chase rig on the train
// -------------------------------------------------------------
/** Seconds of unpaused scene time; drives tweens and the chapter clock. */
let sceneTime = 0;
let cameraTween: {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTime: number;
  durationMs: number;
  done: () => void;
} | null = null;

function setCameraPose(pos: THREE.Vector3, lookAt: THREE.Vector3, durationMs = 600): Promise<void> {
  following = false;
  // A replaced tween still resolves, so nothing awaiting it hangs.
  cameraTween?.done();
  if (durationMs <= 0) {
    cameraTween = null;
    camera.position.copy(pos);
    controls.target.copy(lookAt);
    controls.update();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    cameraTween = {
      startPos: camera.position.clone(),
      endPos: pos.clone(),
      startTarget: controls.target.clone(),
      endTarget: lookAt.clone(),
      // Scene time, so Pause freezes a move instead of letting it jump to the end.
      startTime: sceneTime * 1000,
      durationMs,
      done: resolve,
    };
  });
}

const rideCamera = new RideCamera(camera);
rideCamera.setView('side');
let following = false;
/** The rig's side offset is negative; flip the frame so it lands on the open side, away from the platforms. */
function chaseFrame() {
  const f = kimberley.railFrame(trainState.x);
  return { origin: f.origin, forward: f.forward, side: f.side.clone().negate() };
}
function followPose(): Shot {
  const pose = rideCamera.preview(chaseFrame(), trainState.speedKph / 3.6, 0);
  return { position: pose.position, target: pose.target };
}
function followTrain(enabled: boolean) {
  if (enabled && !following) rideCamera.reseat(chaseFrame(), trainState.speedKph / 3.6, 0);
  following = enabled;
  if (enabled) cameraTween = null;
}

let shakeRemaining = 0;
let shakeIntensity = 0;
function shakeCamera(intensity01: number, durationMs: number) {
  shakeIntensity = intensity01;
  shakeRemaining = durationMs / 1000;
}

// -------------------------------------------------------------
// 4. TRAIN STATE & CONSIST
// -------------------------------------------------------------
/** Metres out from the platform when the chapter starts. */
const START_X = 230;
const trainState = {
  x: START_X, // Metres before the stopping point; the train runs along -x.
  speedKph: 72,
  targetSpeedKph: 72,
  visible: true,
};
/** Until the train has made its Kimberley stop, it brakes to stop at the platform. */
let stopPending = true;
/**
 * Standing at the platform. The chapter only commands the stop once its
 * arrival camera move has finished, which can be after the train is already
 * at rest; without a dwell it crept off again at the platform speed. The train
 * waits until it has been told to stop and then told to go.
 */
let dwell: 'none' | 'arrived' | 'released' = 'none';
/** Service braking, m/s^2. Passenger stock brakes at around 0.6-1.0. */
const BRAKING = 0.75;

const sound = new TrainSound();
let soundEnabled = false;
const audioState: ChapterAudioState = { environment: 'OPEN', cameraMode: 'FOLLOW', trainLevel: 1 };

async function loadTrainConsist() {
  const loader = new GLTFLoader();
  const [engineGlb, coachGlb] = await Promise.all([
    loader.loadAsync('/assets/models/train/quaternius-electric.glb'),
    loader.loadAsync('/assets/models/train/quaternius-passenger.glb'),
  ]);
  const consist = createConsist(engineGlb.scene, coachGlb.scene);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const paint = (colour: string) => {
    if (!materials.has(colour)) materials.set(colour, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6 }));
    return materials.get(colour)!;
  };
  const glass = new THREE.MeshStandardMaterial({ color: '#20343b', roughness: 0.3 });
  kimberley.emissive.push({ material: glass, colour: '#ffca7a', peak: 1.5 });
  // Same livery rules as the Pretoria consist, so the train is recognisably the same train.
  for (const vehicle of consist) {
    vehicle.asset.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true; o.receiveShadow = true;
      const recolor = (m: THREE.Material) => /window|darkblue/i.test(m.name) ? glass
        : paint(/grey|white/i.test(m.name) ? TRAIN_LIVERY.roof : /black|wheel/i.test(m.name) ? TRAIN_LIVERY.underframe : vehicle.color);
      o.material = Array.isArray(o.material) ? o.material.map(recolor) : recolor(o.material);
    });
  }
  kimberley.attachTrain(consist, paint(TRAIN_LIVERY.underframe));
  kimberley.setTrainDistance(trainState.x);
  // Re-apply so the glazing just registered picks up the current light.
  setTimeOfDay(timeOfDay.preset.key);
}

// -------------------------------------------------------------
// 5. ADAPTERS & CONTROLLER
// -------------------------------------------------------------
let fps = 60;
let frameCount = 0;
let lastFpsTime = performance.now();

const uiElements = {
  chapterBanner: document.querySelector<HTMLElement>('#chapter-banner')!,
  phaseBadge: document.querySelector<HTMLElement>('#phase-badge')!,
  locationCard: document.querySelector<HTMLElement>('#location-card')!,
  locationTitle: document.querySelector<HTMLElement>('#location-title')!,
  locationBody: document.querySelector<HTMLElement>('#location-body')!,
  historicalCard: document.querySelector<HTMLElement>('#historical-card')!,
  historicalYear: document.querySelector<HTMLElement>('#historical-year')!,
  historicalTitle: document.querySelector<HTMLElement>('#historical-title')!,
  historicalBody: document.querySelector<HTMLElement>('#historical-body')!,
  timeMachineSlider: document.querySelector<HTMLInputElement>('#time-machine-slider')!,
  timeMachineLabel: document.querySelector<HTMLElement>('#time-machine-label')!,
  timeMachinePanel: document.querySelector<HTMLElement>('#time-machine-panel')!,
  diamondPrompt: document.querySelector<HTMLElement>('#diamond-prompt')!,
  diamondCard: document.querySelector<HTMLElement>('#diamond-card')!,
  passportModal: document.querySelector<HTMLElement>('#passport-modal')!,
  passportStamp: document.querySelector<HTMLElement>('#passport-stamp')!,
  cinematicTopBar: document.querySelector<HTMLElement>('#cine-bar-top')!,
  cinematicBottomBar: document.querySelector<HTMLElement>('#cine-bar-bottom')!,
  toast: document.querySelector<HTMLElement>('#toast')!,
  progressBar: document.querySelector<HTMLElement>('#progress-fill')!,
};

// Cards sit above the controls as they actually wrap.
const footerEl = document.querySelector<HTMLElement>('footer');
if (footerEl) new ResizeObserver(() => document.body.style.setProperty('--footer-h', `${footerEl.offsetHeight + 8}px`)).observe(footerEl);

const adapters = createKimberleyThreeAdapters({
  scene,
  camera,
  renderer,
  kimberley,
  audioState,
  uiElements,
  trainState,
  setCameraPose,
  followTrain,
  followPose,
  setTimeOfDay,
  shakeCamera,
  getFps: () => fps,
  isPaused: () => isPaused,
  now: () => sceneTime * 1000,
  preferences: { interactionMode: 'INTERACTIVE', preferredQuality: 'HIGH' },
});

const chapterController = new KimberleyChapterController(adapters);

// -------------------------------------------------------------
// 6. USER CONTROLS & DEV DIRECTOR
// -------------------------------------------------------------
let isRunning = false;
let isPaused = false;

function resetTrain() {
  trainState.x = START_X;
  trainState.speedKph = 72;
  trainState.targetSpeedKph = 72;
  stopPending = true;
  dwell = 'none';
  kimberley.trainRoot.visible = true;
  kimberley.setTrainDistance(trainState.x);
}

runChapterBtn.onclick = async () => {
  if (isRunning) return;
  isRunning = true;
  resetTrain();
  runChapterBtn.disabled = true;
  runChapterBtn.textContent = 'Chapter Running...';
  statusEl.textContent = 'Running Kimberley Chapter';

  try {
    await chapterController.run();
    statusEl.textContent = 'Kimberley Chapter Complete!';
    // Onward along the line: the next chapter is De Aar, the Karoo junction.
    if (!document.querySelector('#next-chapter')) {
      const next = document.createElement('a');
      next.id = 'next-chapter';
      next.href = '/de-aar';
      next.textContent = 'Continue to De Aar →';
      next.className = 'btn-action';
      next.style.cssText = 'padding:8px 14px;border-radius:8px;text-decoration:none';
      statusEl.before(next);
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    console.error('[Kimberley] Chapter error:', e);
    statusEl.textContent = `Completed: ${String(e)}`;
  } finally {
    isRunning = false;
    runChapterBtn.disabled = false;
    runChapterBtn.textContent = '▶ Play Chapter';
  }
};

pauseBtn.onclick = () => {
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
};

restartBtn.onclick = async () => {
  restartBtn.disabled = true;
  runChapterBtn.disabled = true;
  isPaused = false;
  pauseBtn.textContent = 'Pause';
  chapterController.cancel('User restarted');
  // Let the cancelled run unwind before resetting, or its last steps land on the new scene.
  await chapterController.idle();
  restartBtn.disabled = false;
  for (const element of [uiElements.locationCard, uiElements.historicalCard, uiElements.diamondPrompt, uiElements.diamondCard, uiElements.passportModal]) element.style.display = 'none';
  adapters.camera.setCinematicBars?.(false, 0);
  resetTrain();
  adapters.world.setEraBlend?.(0);
  kimberley.setTramProgress(0);
  kimberley.tramRoot.visible = false;
  setTimeOfDay('day');
  void setCameraPose(kimberley.shots.arrivalWide().position, kimberley.shots.arrivalWide().target, 400);
  statusEl.textContent = 'Restarted · Click Play Chapter';
  runChapterBtn.disabled = false;
  runChapterBtn.textContent = '▶ Play Chapter';
  isRunning = false;
};

soundBtn.onclick = () => {
  soundEnabled = !soundEnabled;
  soundBtn.setAttribute('aria-pressed', String(soundEnabled));
  soundBtn.textContent = soundEnabled ? 'Sound on' : 'Sound off';
  if (soundEnabled) sound.enable();
  else sound.disable();
};

// Dev Director Buttons
document.querySelector<HTMLButtonElement>('#btn-dir-heritage')!.onclick = async () => {
  adapters.world.setEraBlend?.(1);
  adapters.world.setLightingPreset?.('kimberley-heritage-warm', 0);
  await adapters.camera.playPath('kimberley-heritage-reveal');
  adapters.ui.showToast?.('Dev: Heritage mode activated', 'INFO');
};

document.querySelector<HTMLButtonElement>('#btn-dir-tram')!.onclick = async () => {
  await adapters.tram.spawn('vintage-tram');
  await adapters.tram.boardCamera?.();
  adapters.ui.showToast?.('Dev: Tram ride view', 'INFO');
  await adapters.tram.followRouteWithProgress?.('kimberley-tram', 9000, () => {});
};

document.querySelector<HTMLButtonElement>('#btn-dir-bighole')!.onclick = async () => {
  await adapters.camera.transitionToPath('big-hole-reveal', 1000);
  adapters.ui.showToast?.('Dev: Big Hole reveal camera', 'INFO');
  await adapters.camera.playPathWithProgress?.('kimberley-big-hole-descent', () => {});
};

document.querySelector<HTMLButtonElement>('#btn-dir-fallback')!.onclick = async () => {
  adapters.world.setLightingPreset?.('kimberley-warm-afternoon', 0);
  adapters.world.setEraBlend?.(0);
  await adapters.camera.transitionToPath('kimberley-arrival', 800);
  adapters.ui.showToast?.('Dev: Reset to Station view', 'INFO');
};

document.querySelector<HTMLButtonElement>('#btn-dir-reset')!.onclick = () => {
  restartBtn.click();
};

// -------------------------------------------------------------
// 7. ANIMATION LOOP
// -------------------------------------------------------------
let lastTime = performance.now();

function stepTrain(dt: number) {
  let target = trainState.targetSpeedKph / 3.6;
  if (dwell === 'arrived' && trainState.targetSpeedKph <= 0) dwell = 'released';
  if (dwell === 'arrived' || (dwell === 'released' && trainState.targetSpeedKph <= 0)) {
    trainState.speedKph = 0;
    return;
  }
  if (stopPending) {
    // Hold enough speed to arrive, then let the braking curve bring the
    // locomotive to rest exactly at the platform end, whatever the chapter's
    // timing asks for. Stopping short, or overshooting, reads instantly.
    target = Math.max(target, 30 / 3.6);
    target = Math.min(target, Math.sqrt(2 * BRAKING * Math.max(0, trainState.x)));
  }
  let speed = trainState.speedKph / 3.6;
  const rate = target < speed ? Math.max(BRAKING, 1.2) : 0.45;
  speed += Math.sign(target - speed) * Math.min(Math.abs(target - speed), rate * dt);
  trainState.x -= speed * dt;
  if (stopPending && trainState.x <= 0.05) {
    trainState.x = 0;
    speed = 0;
    stopPending = false;
    dwell = 'arrived';
  }
  // The end of the modelled line: come to a stand rather than run off it.
  if (trainState.x < kimberley.trainRange.min + 200) speed = Math.min(speed, Math.sqrt(2 * BRAKING * Math.max(0, trainState.x - kimberley.trainRange.min)));
  trainState.speedKph = speed * 3.6;
}

function animate(now: number) {
  requestAnimationFrame(animate);
  // Real time, capped: a slow frame should not slow the story, but a tab
  // returning from the background should not teleport the train either.
  const dt = Math.min((now - lastTime) / 1000, 0.5);
  lastTime = now;

  frameCount++;
  if (now - lastFpsTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    frameCount = 0;
    lastFpsTime = now;
  }

  if (!isPaused) {
    sceneTime += dt;
    stepTrain(dt);
    kimberley.setTrainDistance(trainState.x);

    if (cameraTween) {
      const t = Math.min(1, (sceneTime * 1000 - cameraTween.startTime) / cameraTween.durationMs);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      camera.position.lerpVectors(cameraTween.startPos, cameraTween.endPos, ease);
      controls.target.lerpVectors(cameraTween.startTarget, cameraTween.endTarget, ease);
      if (t >= 1) { const done = cameraTween.done; cameraTween = null; done(); }
    }

    const trainFront = kimberley.railFrame(trainState.x).origin;
    if (soundEnabled) {
      sound.update({
        speed: (trainState.speedKph / 3.6) * audioState.trainLevel,
        dt,
        distance: -trainState.x,
        nearCrossing: false,
        paused: isPaused,
        cameraMode: audioState.cameraMode,
        cameraDistanceM: camera.position.distanceTo(trainFront),
        environment: audioState.environment,
        atStation: trainState.speedKph < 0.5,
      });
    }

    kimberley.update(sceneTime, dt, camera);
    sky.update(camera.position, dt);
  }

  if (following && !isPaused) {
    const target = rideCamera.update(chaseFrame(), trainState.speedKph / 3.6, 0, dt);
    controls.target.copy(target);
  } else {
    controls.update();
  }
  if (shakeRemaining > 0) {
    shakeRemaining -= dt;
    camera.position.x += (Math.random() - 0.5) * shakeIntensity * 0.4;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.4;
  }
  if (following && !isPaused) rideCamera.applySway(dt, trainState.speedKph / 3.6);

  // Carry the shadow camera with whatever the camera is looking at.
  sunTarget.position.copy(controls.target);
  sun.position.copy(controls.target).add(sunOffset);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const opening = kimberley.shots.arrivalWide();
camera.position.copy(opening.position);
controls.target.copy(opening.target);
controls.update();
requestAnimationFrame(animate);
try {
  await loadTrainConsist();
  statusEl.textContent = 'Kimberley ready · Click Play Chapter';
} catch (error) {
  console.warn('[Kimberley] Train models unavailable:', error);
  statusEl.textContent = 'Kimberley ready (no train models)';
}
runChapterBtn.disabled = false;
// Debug handle, as for Pretoria's __railScene.
(globalThis as unknown as { __kimberley?: unknown }).__kimberley = { kimberley, trainState, camera, controls, adapters, renderer, scene, setTimeOfDay };
