import { sideOfTrack, type TrackSide } from "./windowSide";

/**
 * Trackside landmarks that get a world-space billboard in the 3D ride.
 * `km` is the route distance at which the landmark sits; `offsetM` is how far it
 * actually lies from the track, which the billboard states honestly rather than
 * pretending the sign is on the landmark itself.
 */
export interface Landmark {
  id: string;
  name: string;
  km: number;
  offsetM: number;
  note: string;
  /**
   * Approximate centroid of the landmark. Used to work out which window it
   * passes, via sideOfTrack() - so it wants to be roughly right, not survey
   * grade. km and offsetM are derived from this at load rather than hand-typed.
   */
  at: [number, number];
}

export const LANDMARKS: Landmark[] = [
  { id: "freedom-park", name: "Freedom Park", km: 4.1, offsetM: 500, at: [-25.7600, 28.1900], note: "Memorial and museum on Salvokop" },
  { id: "union-buildings", name: "Union Buildings", km: 6.4, offsetM: 1800, at: [-25.7404, 28.2116], note: "Seat of national government" },
  { id: "maboneng", name: "Maboneng Precinct", km: 62.5, offsetM: 900, at: [-26.2041, 28.0620], note: "Arts and studios quarter" },
  { id: "big-hole", name: "The Big Hole", km: 647, offsetM: 2400, at: [-28.7420, 24.7550], note: "Kimberley diamond mine" },
  { id: "karoo-np", name: "Karoo National Park", km: 1043, offsetM: 5200, at: [-32.3200, 22.5000], note: "Escarpment reserve above Beaufort West" },
  { id: "lord-milner", name: "Lord Milner Hotel", km: 1168, offsetM: 300, at: [-33.2311, 20.5836], note: "Matjiesfontein's Victorian landmark" },
  { id: "hex-river", name: "Hex River Pass", km: 1286, offsetM: 0, at: [-33.4800, 19.6000], note: "Four tunnels through the Hex River Mountains" },
  { id: "table-mountain", name: "Table Mountain", km: 1571, offsetM: 6800, at: [-33.9628, 18.4098], note: "Visible on the approach to Cape Town" },
];

/** Visible window, in metres of track ahead, over which a billboard fades up and back out. */
export const BILLBOARD_FADE_IN_M = 800;
export const BILLBOARD_FADE_OUT_M = 250;

/**
 * 0 when the landmark is out of range, 1 at full brightness. Crucially this also
 * fades back to 0 once the landmark is behind the train - the earlier version
 * clamped to 1 forever past the landmark, leaving Freedom Park lit for the
 * remaining 1,578 km of the route.
 */
export function billboardOpacity(landmarkKm: number, trainKm: number): number {
  const aheadM = (landmarkKm - trainKm) * 1000;
  if (aheadM > BILLBOARD_FADE_IN_M) return 0;
  if (aheadM >= 0) return Math.min(1, (BILLBOARD_FADE_IN_M - aheadM) / 300);
  return Math.max(0, 1 + aheadM / BILLBOARD_FADE_OUT_M);
}

export const litLandmarks = (trainKm: number) =>
  LANDMARKS.filter(landmark => billboardOpacity(landmark.km, trainKm) > 0.02);

/**
 * Landmarks with km, track offset and window side measured from the real route
 * rather than typed by hand. Computed once at module load.
 */
export interface PlacedLandmark extends Landmark {
  side: TrackSide;
}

export const PLACED_LANDMARKS: PlacedLandmark[] = LANDMARKS.map(landmark => {
  const reading = sideOfTrack(landmark.at);
  return {
    ...landmark,
    km: Math.round(reading.km * 10) / 10,
    offsetM: reading.offsetM,
    side: reading.side,
  };
});

/** The next landmark ahead of the train on a given side, if any. */
export const nextOnSide = (trainKm: number, side: TrackSide, withinKm = 60) =>
  PLACED_LANDMARKS.find(
    entry => entry.side === side && entry.km > trainKm && entry.km - trainKm <= withinKm,
  );
