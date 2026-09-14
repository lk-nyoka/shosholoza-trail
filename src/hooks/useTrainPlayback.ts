import { useEffect, useRef } from "react";
import type { Stop, PlaybackSpeed } from "../types";

interface Props {
  km: number;
  setKm: (update: (current: number) => number) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  speed: PlaybackSpeed | number;
  totalKm: number;
  stops: Stop[];
  onStationArrival?: (stop: Stop) => void;
}

export function useTrainPlayback({
  km,
  setKm,
  playing,
  setPlaying,
  speed,
  totalKm,
  stops,
  onStationArrival,
}: Props) {
  const frameRef = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);
  const visitedStations = useRef(new Set<string>());
  const announcedStations = useRef(new Set<string>());
  const approachFactor = useRef(1);
  const previousKm = useRef(km);
  /** The authoritative position between frames, so the rAF never has to read state. */
  const kmRef = useRef(km);
  const arrivalHandler = useRef(onStationArrival);

  useEffect(() => {
    arrivalHandler.current = onStationArrival;
  }, [onStationArrival]);

  useEffect(() => {
    if (km < previousKm.current) {
      for (const stop of stops) {
        if (stop.km >= km) {
          visitedStations.current.delete(stop.id);
          announcedStations.current.delete(stop.id);
        }
      }
      approachFactor.current = 1;
    }
    previousKm.current = km;
    kmRef.current = km;
  }, [km, stops]);

  useEffect(() => {
    if (!playing) {
      lastTime.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      return;
    }

    const animate = (currentTime: number) => {
      const previousTime = lastTime.current ?? currentTime;
      const deltaMs = Math.min(32, currentTime - previousTime);
      lastTime.current = currentTime;

      /**
       * Everything is worked out HERE, and only the resulting number is handed
       * to setKm.
       *
       * This used to live inside the setKm updater, which React runs during the
       * render phase - and it called setPlaying, fired the arrival callback and
       * spoke a speech announcement from in there. Calling setState from inside
       * an updater is a render-phase side effect: React warned about exceeding
       * the update depth, re-ran the updater under StrictMode, and the station
       * announcement could be spoken twice. An updater has to be pure; the
       * effects belong out here.
       */
      const currentKm = kmRef.current;
      // 0.25 km/s at 1x - roughly 1 km every four seconds, which is the pace
      // the ride camera was tuned against.
      const nextStation = stops.find(stop => stop.km > currentKm && !visitedStations.current.has(stop.id));
      const distanceToStation = nextStation ? nextStation.km - currentKm : Infinity;
      const approaching = distanceToStation > 0 && distanceToStation <= 2.5;
      const targetFactor = approaching ? 0.22 + (distanceToStation / 2.5) * 0.78 : 1;
      approachFactor.current += (targetFactor - approachFactor.current) * (1 - Math.exp(-3.5 * deltaMs / 1000));

      if (nextStation && approaching && !announcedStations.current.has(nextStation.id)) {
        announcedStations.current.add(nextStation.id);
        if (typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined") {
          window.speechSynthesis.cancel();
          const announcement = new SpeechSynthesisUtterance(`Next station, ${nextStation.name}. Approaching ${nextStation.name}.`);
          announcement.rate = 0.92;
          announcement.pitch = 1;
          announcement.lang = "en-ZA";
          window.speechSynthesis.speak(announcement);
        }
      }

      const nextKm = Math.min(totalKm, currentKm + deltaMs * 0.00025 * speed * approachFactor.current);
      const arrived = stops.find(
        stop => stop.km > currentKm && stop.km <= nextKm && !visitedStations.current.has(stop.id)
      );

      if (arrived) {
        visitedStations.current.add(arrived.id);
        kmRef.current = arrived.km;
        setKm(() => arrived.km);
        setPlaying(false);
        arrivalHandler.current?.(arrived);
        return;
      }

      kmRef.current = nextKm;
      setKm(() => nextKm);
      if (nextKm >= totalKm) setPlaying(false);

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [playing, setKm, setPlaying, speed, stops, totalKm]);
}