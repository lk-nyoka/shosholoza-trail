import { computeTrainAudioMix } from "./mix.js";
import type { EnvironmentZone, TrainAudioState } from "./types.js";

type LoadedBufferMap = {
  idle: AudioBuffer;
  railJoint: AudioBuffer;
  brakeHiss: AudioBuffer;
  brakeSqueal: AudioBuffer;
  horn: AudioBuffer;
  bridgeRumble: AudioBuffer;
  metalClank: AudioBuffer;
  crossingBell: AudioBuffer;
};

export interface TrainAudioEngineOptions {
  /** Nominal maximum output. State masterVolume multiplies this value. */
  baseMasterVolume?: number;
  /** Approximate rail-joint spacing used for the rhythmic wheel sound. */
  railJointSpacingM?: number;
}

export class TrainAudioEngine {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly engineGain: GainNode;
  private readonly idleGain: GainNode;
  private readonly windGain: GainNode;
  private readonly rumbleGain: GainNode;
  private readonly bridgeGain: GainNode;
  private readonly tunnelWetGain: GainNode;

  private readonly engineOscA: OscillatorNode;
  private readonly engineOscB: OscillatorNode;
  private readonly engineNoise: AudioBufferSourceNode;
  private readonly engineFilter: BiquadFilterNode;
  private readonly windNoise: AudioBufferSourceNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly lowRumbleOsc: OscillatorNode;
  private readonly tunnelConvolver: ConvolverNode;

  private idleSource: AudioBufferSourceNode | null = null;
  private bridgeSource: AudioBufferSourceNode | null = null;
  private buffers: LoadedBufferMap | null = null;
  private initPromise: Promise<void> | null = null;
  private disposed = false;

  readonly levels = { master: 1, traction: 1, rail: 1, wind: 1, rumble: 1, bridge: 1, brakes: 1 };
  private oneShots = new Set<AudioBufferSourceNode>();
  private sourceDistance: number | null = null;
  private shotDistanceGain = 1;
  private totalDistanceM = 0;
  private lastJointDistanceM = 0;
  private lastUpdateTimeMs = performance.now();
  private currentEnvironment: EnvironmentZone = "OPEN";
  private lastBrakeHissTime = -Infinity;
  private lastBrakeSquealTime = -Infinity;
  private crossingTimers = new Set<number>();

  private readonly baseMasterVolume: number;
  private readonly railJointSpacingM: number;

  constructor(options: TrainAudioEngineOptions = {}) {
    this.baseMasterVolume = Math.min(1, Math.max(0, options.baseMasterVolume ?? 0.82));
    this.railJointSpacingM = Math.max(3, options.railJointSpacingM ?? 13.5);

    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    // Safety limiter: overlapping horn, rail, bridge and engine layers should not hard-clip.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 10;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.20;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.engineGain = this.ctx.createGain();
    this.idleGain = this.ctx.createGain();
    this.windGain = this.ctx.createGain();
    this.rumbleGain = this.ctx.createGain();
    this.bridgeGain = this.ctx.createGain();
    this.tunnelWetGain = this.ctx.createGain();

    this.engineGain.connect(this.master);
    this.idleGain.connect(this.master);
    this.windGain.connect(this.master);
    this.rumbleGain.connect(this.master);
    this.bridgeGain.connect(this.master);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 0.7;
    this.engineFilter.connect(this.engineGain);

    // Small algorithmic reverb send used only in tunnels.
    this.tunnelConvolver = this.ctx.createConvolver();
    this.tunnelConvolver.buffer = this.makeImpulseResponse(0.75, 2.8);
    this.engineFilter.connect(this.tunnelConvolver);
    this.tunnelConvolver.connect(this.tunnelWetGain);
    this.tunnelWetGain.connect(this.master);
    this.tunnelWetGain.gain.value = 0;

    this.engineOscA = this.ctx.createOscillator();
    this.engineOscA.type = "sawtooth";
    this.engineOscA.frequency.value = 46;
    this.engineOscA.connect(this.engineFilter);

    this.engineOscB = this.ctx.createOscillator();
    this.engineOscB.type = "sine";
    this.engineOscB.frequency.value = 92;
    this.engineOscB.connect(this.engineFilter);

    this.engineNoise = this.makeLoopingNoise();
    const engineNoiseGain = this.ctx.createGain();
    engineNoiseGain.gain.value = 0.035;
    this.engineNoise.connect(engineNoiseGain).connect(this.engineFilter);

    this.windNoise = this.makeLoopingNoise();
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = "highpass";
    this.windFilter.frequency.value = 550;
    this.windFilter.Q.value = 0.35;
    this.windNoise.connect(this.windFilter).connect(this.windGain);

    this.lowRumbleOsc = this.ctx.createOscillator();
    this.lowRumbleOsc.type = "sine";
    this.lowRumbleOsc.frequency.value = 38;
    this.lowRumbleOsc.connect(this.rumbleGain);

    this.engineOscA.start();
    this.engineOscB.start();
    this.engineNoise.start();
    this.windNoise.start();
    this.lowRumbleOsc.start();

    this.engineGain.gain.value = 0;
    this.idleGain.gain.value = 0;
    this.windGain.gain.value = 0;
    this.rumbleGain.gain.value = 0;
    this.bridgeGain.gain.value = 0;
  }

  get isReady(): boolean {
    return this.buffers !== null && !this.disposed;
  }

  get contextState(): AudioContextState {
    return this.ctx.state;
  }

  init(basePath = "/audio/train"): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("TrainAudioEngine has been disposed."));
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const [idle, railJoint, brakeHiss, brakeSqueal, horn, bridgeRumble, metalClank, crossingBell] =
        await Promise.all([
          this.load(`${basePath}/idle_hum.wav`),
          this.load(`${basePath}/rail_joint.wav`),
          this.load(`${basePath}/brake_hiss.wav`),
          this.load(`${basePath}/brake_squeal.wav`),
          this.load(`${basePath}/horn.wav`),
          this.load(`${basePath}/bridge_rumble.wav`),
          this.load(`${basePath}/metal_clank.wav`),
          this.load(`${basePath}/crossing_bell.wav`),
        ]);

      if (this.disposed) return;
      this.buffers = { idle, railJoint, brakeHiss, brakeSqueal, horn, bridgeRumble, metalClank, crossingBell };
      this.startLoopingBuffers();
    })().catch((error) => {
      this.initPromise = null;
      throw error;
    });

    return this.initPromise;
  }

  async resume(): Promise<void> {
    if (this.disposed) return;
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  async suspend(): Promise<void> {
    for (const timer of this.crossingTimers) window.clearTimeout(timer);
    this.crossingTimers.clear();
    for (const source of this.oneShots) { try { source.stop(); } catch {} }
    this.oneShots.clear();
    this.sourceDistance = null;
    if (!this.disposed && this.ctx.state === "running") await this.ctx.suspend();
  }

  update(state: TrainAudioState, dtSeconds?: number): void {
    if (!this.isReady || this.disposed) return;

    const nowMs = performance.now();
    const measuredDt = (nowMs - this.lastUpdateTimeMs) / 1000;
    this.lastUpdateTimeMs = nowMs;
    const dt = Math.max(0, Math.min(0.1, dtSeconds ?? measuredDt));

    const mix = computeTrainAudioMix(state);
    const speed = Math.max(0, state.speedKph);
    const speedMps = speed / 3.6;
    const brake = Math.min(1, Math.max(0, state.brakeIntensity));
    const nowAudio = this.ctx.currentTime;

    if (state.distanceM !== undefined) {
      const delta = this.sourceDistance === null ? 0 : state.distanceM - this.sourceDistance;
      if (this.sourceDistance === null || delta < 0 || delta > Math.max(5, speedMps * dt * 3)) {
        this.lastJointDistanceM = state.distanceM;
      }
      this.totalDistanceM = state.distanceM;
      this.sourceDistance = state.distanceM;
    } else this.totalDistanceM += speedMps * dt;
    this.shotDistanceGain = 1 / (1 + Math.max(0, state.cameraDistanceM - 8) / 45);
    this.triggerRailJoints(speed, mix.speed01);

    this.engineOscA.frequency.setTargetAtTime(mix.engineHz, nowAudio, 0.12);
    this.engineOscB.frequency.setTargetAtTime(mix.engineHz * 2.02, nowAudio, 0.12);
    this.engineFilter.frequency.setTargetAtTime(mix.engineFilterHz, nowAudio, 0.18);

    this.setGain(this.master, this.baseMasterVolume * mix.masterGain * this.levels.master, 0.10);
    this.setGain(this.engineGain, mix.engineVolume * this.levels.traction, 0.15);
    this.setGain(this.idleGain, mix.idleVolume * this.levels.traction, 0.20);
    this.setGain(this.windGain, mix.windVolume * this.levels.wind * this.shotDistanceGain, 0.24);
    this.setGain(this.rumbleGain, mix.rumbleVolume * this.levels.rumble, 0.17);
    this.setGain(this.bridgeGain, mix.bridgeVolume * this.levels.bridge, 0.35);
    this.setGain(this.tunnelWetGain, mix.tunnelWet * this.levels.traction * this.shotDistanceGain, 0.30);

    this.triggerBraking(brake, speed, nowAudio, state.accelerationMps2);

    if (state.environment !== this.currentEnvironment) {
      this.onEnvironmentChanged(state.environment);
      this.currentEnvironment = state.environment;
    }

  }

  horn(volume = 0.68): void {
    if (!this.buffers || this.disposed) return;
    this.playOneShot(this.buffers.horn, volume, 0.995 + Math.random() * 0.01);
  }

  crossingSequence(): void {
    if (!this.buffers || this.disposed) return;
    this.horn(0.72);
    this.schedule(() => this.buffers && this.playOneShot(this.buffers.crossingBell, 0.20), 320);
    this.schedule(() => this.buffers && this.playOneShot(this.buffers.crossingBell, 0.16), 1240);
  }

  metalClank(volume = 0.13): void {
    if (!this.buffers || this.disposed) return;
    this.playOneShot(this.buffers.metalClank, volume, 0.96 + Math.random() * 0.08);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.suspend();

    for (const timer of this.crossingTimers) window.clearTimeout(timer);
    this.crossingTimers.clear();

    for (const source of [
      this.engineOscA,
      this.engineOscB,
      this.engineNoise,
      this.windNoise,
      this.lowRumbleOsc,
      this.idleSource,
      this.bridgeSource,
    ]) {
      if (!source) continue;
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }

    try { this.master.disconnect(); } catch { /* noop */ }
    try { this.limiter.disconnect(); } catch { /* noop */ }
    if (this.ctx.state !== "closed") await this.ctx.close();
  }

  private startLoopingBuffers(): void {
    if (!this.buffers) return;

    this.idleSource = this.ctx.createBufferSource();
    this.idleSource.buffer = this.buffers.idle;
    this.idleSource.loop = true;
    this.idleSource.connect(this.idleGain);
    this.idleSource.start();

    this.bridgeSource = this.ctx.createBufferSource();
    this.bridgeSource.buffer = this.buffers.bridgeRumble;
    this.bridgeSource.loop = true;
    this.bridgeSource.connect(this.bridgeGain);
    this.bridgeSource.start();
  }

  private triggerRailJoints(speedKph: number, speed01: number): void {
    if (!this.buffers) return;
    if (speedKph <= 8) { this.lastJointDistanceM = this.totalDistanceM; return; }

    let safety = 0;
    while (this.totalDistanceM - this.lastJointDistanceM >= this.railJointSpacingM && safety < 3) {
      this.lastJointDistanceM += this.railJointSpacingM;
      this.playOneShot(this.buffers.railJoint, (0.13 + speed01 * 0.17) * this.levels.rail, 0.97 + Math.random() * 0.06);
      safety += 1;
    }
  }

  private triggerBraking(brake: number, speedKph: number, nowAudio: number, acceleration: number): void {
    if (!this.buffers || brake <= 0.15 || speedKph <= 10) return;

    const slowing = acceleration < -0.02;
    if (!slowing) return;

    if (nowAudio - this.lastBrakeHissTime > 0.85) {
      this.lastBrakeHissTime = nowAudio;
      this.playOneShot(this.buffers.brakeHiss, (0.08 + brake * 0.16) * this.levels.brakes, 0.98 + Math.random() * 0.04);
    }

    if (speedKph > 35 && brake > 0.52 && nowAudio - this.lastBrakeSquealTime > 1.4) {
      this.lastBrakeSquealTime = nowAudio;
      this.playOneShot(this.buffers.brakeSqueal, (0.04 + brake * 0.11) * this.levels.brakes, 0.96 + Math.random() * 0.07);
    }
  }

  private onEnvironmentChanged(zone: EnvironmentZone): void {
    if (zone === "BRIDGE") this.metalClank(0.10);
    if (zone === "CROSSING") this.crossingSequence();
  }

  private schedule(callback: () => void, delayMs: number): void {
    const id = window.setTimeout(() => {
      this.crossingTimers.delete(id);
      if (!this.disposed) callback();
    }, delayMs);
    this.crossingTimers.add(id);
  }

  private makeLoopingNoise(): AudioBufferSourceNode {
    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private makeImpulseResponse(seconds: number, decay: number): AudioBuffer {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const envelope = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return impulse;
  }

  private async load(url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load audio asset: ${url} (${response.status})`);
    return this.ctx.decodeAudioData(await response.arrayBuffer());
  }

  private playOneShot(buffer: AudioBuffer, volume = 0.2, playbackRate = 1): void {
    if (this.disposed || this.ctx.state !== "running") return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    gain.gain.value = Math.max(0, volume) * this.shotDistanceGain;
    source.connect(gain).connect(this.master);
    this.oneShots.add(source);
    source.start();
    source.onended = () => {
      this.oneShots.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }

  private setGain(node: GainNode, value: number, timeConstant: number): void {
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(Math.max(0, value), now, Math.max(0.01, timeConstant));
  }
}
