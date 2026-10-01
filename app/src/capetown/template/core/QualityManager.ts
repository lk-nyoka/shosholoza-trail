import type { QualityLevel } from "./types.js";

export class QualityManager {
  private samples: number[] = [];

  constructor(private readonly forced?: QualityLevel) {}

  addFpsSample(fps: number): void {
    if (!Number.isFinite(fps) || fps <= 0) return;
    this.samples.push(fps);
    if (this.samples.length > 30) this.samples.shift();
  }

  getLevel(): QualityLevel {
    if (this.forced) return this.forced;
    if (!this.samples.length) return "HIGH";

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    if (avg < 28) return "LOW";
    if (avg < 42) return "MEDIUM";
    if (avg < 58) return "HIGH";
    return "ULTRA";
  }

  getSettings() {
    const level = this.getLevel();
    return {
      level,
      mountainCloudParticles:
        level === "LOW" ? 120 :
        level === "MEDIUM" ? 300 :
        level === "HIGH" ? 650 : 1000,
      gullCount:
        level === "LOW" ? 0 :
        level === "MEDIUM" ? 4 :
        level === "HIGH" ? 10 : 18,
      oceanDetail:
        level === "LOW" ? 0.25 :
        level === "MEDIUM" ? 0.50 :
        level === "HIGH" ? 0.80 : 1,
      boKaapParticles:
        level === "LOW" ? 80 :
        level === "MEDIUM" ? 180 :
        level === "HIGH" ? 360 : 600,
      postProcessing: level === "HIGH" || level === "ULTRA",
      heroAssetTier:
        level === "LOW" ? "lite" :
        level === "MEDIUM" ? "medium" : "high",
    };
  }
}
