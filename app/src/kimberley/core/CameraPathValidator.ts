import type { CameraPathKeyframe } from "./types.js";

export interface CameraPathValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function quaternionLength(q: [number, number, number, number]): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

export function validateCameraPath(
  keyframes: CameraPathKeyframe[],
): CameraPathValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (keyframes.length < 2) errors.push("A camera path needs at least two keyframes.");

  let previousTime = -Infinity;
  for (let i = 0; i < keyframes.length; i += 1) {
    const frame = keyframes[i];

    if (!Number.isFinite(frame.timeMs) || frame.timeMs < 0) {
      errors.push(`Keyframe ${i}: timeMs must be a finite non-negative number.`);
    }
    if (frame.timeMs <= previousTime) {
      errors.push(`Keyframe ${i}: timeMs must be strictly increasing.`);
    }
    previousTime = frame.timeMs;

    if (frame.position.some((value) => !Number.isFinite(value))) {
      errors.push(`Keyframe ${i}: position contains a non-finite value.`);
    }

    const qLen = quaternionLength(frame.quaternion);
    if (!Number.isFinite(qLen) || qLen < 0.5) {
      errors.push(`Keyframe ${i}: quaternion is invalid.`);
    } else if (Math.abs(qLen - 1) > 0.04) {
      warnings.push(`Keyframe ${i}: quaternion length is ${qLen.toFixed(3)}; normalize it before playback.`);
    }

    if (frame.fov != null && (frame.fov < 15 || frame.fov > 100)) {
      warnings.push(`Keyframe ${i}: FOV ${frame.fov} is unusually extreme.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
