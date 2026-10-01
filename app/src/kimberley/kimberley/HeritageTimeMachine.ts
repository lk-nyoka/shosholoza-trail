import type { KimberleyAdapters } from "../adapters/contracts.js";
import { KIMBERLEY_CONFIG } from "./config.js";

function labelForBlend(blend01: number): string {
  if (blend01 < 0.2) return "Present day";
  if (blend01 < 0.55) return "Transitioning through Kimberley's heritage";
  if (blend01 < 0.9) return "Diamond-rush era interpretation";
  return "Heritage view";
}

export async function playHeritageTimeMachine(
  adapters: KimberleyAdapters,
  signal?: AbortSignal,
): Promise<void> {
  if (!adapters.world.setEraBlend) return;

  const update = async (blend01: number) => {
    const value = Math.max(0, Math.min(1, blend01));
    await adapters.world.setEraBlend?.(value);
    await adapters.ui.setTimeMachineState?.(value, labelForBlend(value));
  };

  const interactive =
    KIMBERLEY_CONFIG.featureFlags.interactiveTimeMachine &&
    adapters.preferences?.interactionMode !== "AUTO" &&
    adapters.ui.runTimeMachineControl;

  if (interactive) {
    await adapters.ui.runTimeMachineControl!(update, signal);
    await update(1);
    return;
  }

  const duration = adapters.preferences?.reducedMotion
    ? 600
    : KIMBERLEY_CONFIG.durations.timeMachineAutoMs;
  const steps = adapters.preferences?.reducedMotion ? 4 : 16;

  for (let i = 0; i <= steps; i += 1) {
    if (signal?.aborted) throw signal.reason;
    await update(i / steps);
    if (i < steps) await adapters.clock.sleep(duration / steps, signal);
  }
}
