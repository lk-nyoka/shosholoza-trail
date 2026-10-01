import type { KimberleyAdapters } from "../adapters/contracts.js";
import { ExperienceStepError, isAbortLike } from "./ExperienceError.js";

export async function runOptionalStep(
  adapters: KimberleyAdapters,
  stepId: string,
  action: () => Promise<void>,
  fallback?: () => Promise<void>,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (error) {
    // A cancelled run is not a failed step: never fall back over a reset scene.
    if (isAbortLike(error) || signal?.aborted) throw signal?.reason ?? error;

    adapters.analytics?.event("kimberley_optional_step_failed", {
      stepId,
      error: error instanceof Error ? error.message : String(error),
    });
    await adapters.ui.showToast?.(
      `${stepId} switched to a fallback presentation.`,
      "WARNING",
    );
    if (fallback) await fallback();
    return false;
  }
}

export async function runCriticalStep(
  stepId: string,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (isAbortLike(error)) throw error;
    throw new ExperienceStepError(`Critical step failed: ${stepId}`, stepId, error);
  }
}
