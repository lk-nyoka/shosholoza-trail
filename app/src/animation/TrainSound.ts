// Adapter for the supplied procedural train audio pack. The scene owns motion.
import { TrainAudioEngine } from '../audio/train-pack/TrainAudioEngine';
import type { CameraMode, EnvironmentZone, TrainAudioState } from '../audio/train-pack/types';

export type SoundState = {
  speed: number; distance: number; nearCrossing: boolean;
  dt?: number; paused?: boolean; cameraMode?: CameraMode;
  cameraDistanceM?: number; environment?: EnvironmentZone; atStation?: boolean;
};
export class TrainSound {
  private engine: TrainAudioEngine | null = null;
  private enabled = false;
  private disposed = false;
  private suspended = false;
  private revision = 0;
  private previous: SoundState | null = null;
  private panel: HTMLDetailsElement | null = null;
  private telemetry: HTMLElement | null = null;
  private override: EnvironmentZone | null = null;
  private overrideUntil = 0;
  private lastTelemetry = 0;
  get on() { return this.enabled; }
  get diagnostics() { return { ready: this.engine?.isReady ?? false, context: this.engine?.contextState ?? 'not-created', state: this.latest }; }
  private latest: TrainAudioState | null = null;
  async enable() {
    if (this.disposed) return;
    const revision = ++this.revision;
    this.engine ??= new TrainAudioEngine();
    // Resume synchronously from the gesture, before any asset request completes.
    try {
      await Promise.all([this.engine.resume(), this.engine.init()]);
      if (this.disposed || revision !== this.revision) return;
      this.enabled = true; this.suspended = false; this.previous = null;
      this.createPanel();
    } catch (error) { this.enabled = false; await this.engine.suspend(); throw error; }
  }
  disable() { this.revision++; this.enabled = false; this.previous = null; void this.engine?.suspend(); }
  update(state: SoundState) {
    if (!this.enabled || !this.engine || this.disposed) return;
    const paused = !!state.paused || document.hidden;
    if (paused !== this.suspended) {
      this.suspended = paused; this.previous = null;
      if (paused) void this.engine.suspend(); else void this.engine.resume().catch(() => this.disable());
    }
    if (paused) return;
    const dt = state.dt ?? 1 / 60;
    const delta = this.previous ? state.distance - this.previous.distance : 0;
    const continuous = this.previous && dt > 0 && delta >= 0 && delta < Math.max(5, state.speed * dt * 3);
    const acceleration = continuous ? Math.max(-6, Math.min(6, (state.speed - this.previous!.speed) / dt)) : 0;
    this.latest = {
      speedKph: state.speed * 3.6, accelerationMps2: acceleration,
      brakeIntensity: Math.min(1, Math.max(0, -acceleration / 1.5)), distanceM: state.distance,
      cameraMode: state.cameraMode ?? 'FOLLOW', cameraDistanceM: state.cameraDistanceM ?? 8,
      environment: this.override && performance.now() < this.overrideUntil ? this.override : state.nearCrossing ? 'CROSSING' : state.environment ?? 'OPEN',
      atStation: state.atStation ?? false,
    };
    this.engine.update(this.latest, dt); this.previous = state;
    if (this.telemetry && performance.now() - this.lastTelemetry > 200) {
      this.telemetry.textContent = `${this.latest.speedKph.toFixed(1)} km/h | a ${acceleration.toFixed(2)} m/s? | brake ${this.latest.brakeIntensity.toFixed(2)}\n${this.latest.environment} | ${this.latest.cameraMode} | camera ${this.latest.cameraDistanceM.toFixed(0)} m | route ${state.distance.toFixed(0)} m`;
      this.lastTelemetry = performance.now();
    }
  }
  private createPanel() {
    if (this.panel || !(import.meta.env.DEV || new URLSearchParams(location.search).has('audioDebug'))) return;
    const panel = document.createElement('details'); panel.dataset.trainAudio = 'debug';
    panel.style.cssText = 'position:fixed;right:12px;top:90px;z-index:1000;background:#10202eee;color:#fff;padding:12px;border-radius:12px;font:12px system-ui;max-width:310px;max-height:65vh;overflow:auto';
    const title = document.createElement('summary'); title.textContent = 'Train audio ? development'; panel.append(title);
    this.telemetry = document.createElement('pre'); this.telemetry.style.whiteSpace = 'pre-wrap'; panel.append(this.telemetry);
    for (const key of Object.keys(this.engine!.levels) as (keyof TrainAudioEngine['levels'])[]) {
      const label = document.createElement('label'); label.style.display = 'block'; label.textContent = key + ' ';
      const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.05'; input.value = '1'; input.setAttribute('aria-label', `Audio ${key}`);
      input.oninput = () => { this.engine!.levels[key] = Number(input.value); }; label.append(input); panel.append(label);
    }
    for (const name of ['Horn', 'Crossing', 'Bridge', 'Tunnel', 'Route']) {
      const button = document.createElement('button'); button.textContent = name; button.type = 'button';
      button.onclick = () => {
        if (!this.enabled || this.suspended) return;
        if (name === 'Horn') this.engine!.horn();
        else if (name === 'Crossing') this.engine!.crossingSequence();
        else { this.override = name === 'Route' ? null : name.toUpperCase() as EnvironmentZone; this.overrideUntil = performance.now() + 5000; }
      }; panel.append(button);
    }
    const note = document.createElement('p'); note.textContent = 'Bridge / Tunnel simulate 5 seconds; Route restores scene triggers.'; panel.append(note);
    document.body.append(panel); this.panel = panel;
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.disable(); this.panel?.remove(); void this.engine?.dispose(); }
}
