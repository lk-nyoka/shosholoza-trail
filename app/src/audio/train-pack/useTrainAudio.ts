import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TrainAudioEngine, type TrainAudioEngineOptions } from "./TrainAudioEngine.js";
import type { TrainAudioState } from "./types.js";

export interface UseTrainAudioOptions extends TrainAudioEngineOptions {
  basePath?: string;
}

/**
 * React wrapper around TrainAudioEngine.
 * Create it once near the journey/train controller.
 * Call resume() from a user gesture because browsers block autoplay audio.
 */
export function useTrainAudio(options: UseTrainAudioOptions = {}) {
  const engineRef = useRef<TrainAudioEngine | null>(null);
  const [ready, setReady] = useState(false);
  const basePath = options.basePath ?? "/audio/train";
  const baseMasterVolume = options.baseMasterVolume;
  const railJointSpacingM = options.railJointSpacingM;

  useEffect(() => {
    const engine = new TrainAudioEngine({ baseMasterVolume, railJointSpacingM });
    engineRef.current = engine;
    let mounted = true;

    engine.init(basePath)
      .then(() => mounted && setReady(true))
      .catch((error) => {
        console.error("Train audio failed to initialise", error);
        if (mounted) setReady(false);
      });

    return () => {
      mounted = false;
      setReady(false);
      engineRef.current = null;
      void engine.dispose();
    };
  }, [basePath, baseMasterVolume, railJointSpacingM]);

  const resume = useCallback(() => engineRef.current?.resume() ?? Promise.resolve(), []);
  const update = useCallback((state: TrainAudioState, dtSeconds?: number) => {
    engineRef.current?.update(state, dtSeconds);
  }, []);
  const horn = useCallback(() => engineRef.current?.horn(), []);
  const crossingSequence = useCallback(() => engineRef.current?.crossingSequence(), []);
  const metalClank = useCallback(() => engineRef.current?.metalClank(), []);

  return useMemo(() => ({
    ready,
    resume,
    update,
    horn,
    crossingSequence,
    metalClank,
  }), [ready, resume, update, horn, crossingSequence, metalClank]);
}
