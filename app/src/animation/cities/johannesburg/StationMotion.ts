/** Authored station sequence. Arrival 0–24, dwell 24–32, departure 32–64. */
export const DEPARTURE_START = 32;
export const JOURNEY_END = 64;
export function stationMotion(time: number) {
  const t = Math.max(0, Math.min(JOURNEY_END, time));
  if (t < 24) {
    // Coast, then integrate a smooth braking ramp. The original cubic started
    // at 153 km/h immediately outside the platform. Keep the established scene
    // duration/endpoints while reducing peak speed to 68 km/h.
    const cruise = 340 / 18, u = Math.max(0, (t - 12) / 12);
    const travelled = cruise * (Math.min(t, 12) + 12 * (u - u ** 3 + .5 * u ** 4));
    return { x: -340 + travelled, speed: cruise * (1 - 3 * u ** 2 + 2 * u ** 3), phase: 'arriving' as const };
  }
  if (t <= DEPARTURE_START) return { x: 0, speed: 0, phase: 'dwell' as const };
  const departure = t - DEPARTURE_START, u = Math.min(1, departure / 8);
  // Integrate a smoothstep speed ramp: no instantaneous jump in acceleration.
  const x = departure < 8 ? 144 * (u ** 3 - .5 * u ** 4) : 18 * (departure - 4);
  return { x, speed: 18 * u * u * (3 - 2 * u), phase: t < JOURNEY_END ? 'departing' as const : 'complete' as const };
}
