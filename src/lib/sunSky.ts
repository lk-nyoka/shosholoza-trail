/**
 * Where the sun actually is, and what the world looks like because of it.
 *
 * The ride was lit by one fixed directional light pointing down and to the
 * left, all day, every day. A train that boards Pretoria at 08:30 and reaches
 * Cape Town at 12:40 the next day spends a whole night in that light, and the
 * Karoo — the darkest sky on the route, and the part of the journey people
 * describe first — looked like midday.
 *
 * This module answers three questions and nothing else:
 *
 *   1. Where is the sun, for a real instant and a real point on the corridor?
 *   2. What phase of the day is that, on a continuous scale rather than a
 *      switch between "day" and "night"?
 *   3. What colours, intensities and fog does that phase imply?
 *
 * The scene consumes the third. The first is the NOAA solar-position
 * algorithm, implemented here rather than pulled in as a dependency: it is
 * about sixty lines of arithmetic, it has no data file behind it, and adding a
 * package to a PWA that has to work offline on a phone in the Karoo is a cost
 * with no matching benefit.
 *
 * Accuracy: the NOAA algorithm is good to roughly ±0.1° of elevation for dates
 * within a century of 2000, which is far finer than anything the renderer can
 * show. The tests pin it against published solstice figures for Cape Town.
 *
 * Nothing here touches Three.js, the DOM or the clock. Everything is a pure
 * function of (instant, latitude, longitude), so all of it is testable.
 */

import { RAILWAY_UTC_OFFSET_MINUTES } from "./corridor";

// ── Solar position ────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SolarPosition {
  /** Degrees above the horizon. Negative below it. Refraction-corrected. */
  elevationDeg: number;
  /** Degrees clockwise from true north. 0 = north, 90 = east, 180 = south. */
  azimuthDeg: number;
  /** Solar declination, degrees. Positive in the northern summer. */
  declinationDeg: number;
  /** Hour angle, degrees. 0 at local solar noon, negative in the morning. */
  hourAngleDeg: number;
  /** True when the sun is climbing — the morning half of the day. */
  rising: boolean;
}

/** Julian day for an instant, on the astronomical (noon-based) scale. */
export function julianDay(at: Date): number {
  return at.getTime() / 86_400_000 + 2_440_587.5;
}

/**
 * Atmospheric refraction, degrees, for a true elevation.
 *
 * The standard NOAA correction. It matters most exactly where the scene cares
 * most: within a degree of the horizon it is over half a degree, which is why
 * the sun is visible when it is geometrically already below it. Sunrise is
 * defined at −0.833° for this reason, not at 0°.
 */
function refraction(elevationDeg: number): number {
  if (elevationDeg > 85) return 0;
  const t = Math.tan(elevationDeg * RAD);
  if (elevationDeg > 5) {
    return (58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5) / 3600;
  }
  if (elevationDeg > -0.575) {
    return (
      (1735 +
        elevationDeg *
          (-518.2 + elevationDeg * (103.4 + elevationDeg * (-12.79 + elevationDeg * 0.711)))) /
      3600
    );
  }
  return (-20.772 / t) / 3600;
}

/**
 * NOAA solar position for an instant and a point on the earth.
 *
 * `latitude` is degrees north (negative south — every point on this corridor
 * is negative), `longitude` degrees east.
 */
export function solarPosition(at: Date, latitude: number, longitude: number): SolarPosition {
  const jd = julianDay(at);
  const century = (jd - 2_451_545) / 36_525;

  const meanLongitude =
    (280.46646 + century * (36000.76983 + century * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + century * (35999.05029 - 0.0001537 * century);
  const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century);

  const centre =
    Math.sin(meanAnomaly * RAD) * (1.914602 - century * (0.004817 + 0.000014 * century)) +
    Math.sin(2 * meanAnomaly * RAD) * (0.019993 - 0.000101 * century) +
    Math.sin(3 * meanAnomaly * RAD) * 0.000289;

  const trueLongitude = meanLongitude + centre;
  const omega = 125.04 - 1934.136 * century;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  const meanObliquity =
    23 +
    (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * RAD);

  const declination =
    Math.asin(Math.sin(obliquity * RAD) * Math.sin(apparentLongitude * RAD)) * DEG;

  // Equation of time, minutes.
  const y = Math.tan((obliquity / 2) * RAD) ** 2;
  const equationOfTime =
    4 *
    DEG *
    (y * Math.sin(2 * meanLongitude * RAD) -
      2 * eccentricity * Math.sin(meanAnomaly * RAD) +
      4 * eccentricity * y * Math.sin(meanAnomaly * RAD) * Math.cos(2 * meanLongitude * RAD) -
      0.5 * y * y * Math.sin(4 * meanLongitude * RAD) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * RAD));

  // Minutes of UTC elapsed since midnight, from UTC fields only, so the
  // machine's own timezone can never change the answer.
  const utcMinutes =
    at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60 + at.getUTCMilliseconds() / 60000;
  const trueSolarMinutes = (utcMinutes + equationOfTime + 4 * longitude + 1440) % 1440;
  const hourAngle = trueSolarMinutes / 4 - 180;

  const latRad = latitude * RAD;
  const decRad = declination * RAD;
  const haRad = hourAngle * RAD;

  const cosZenith =
    Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith))) * DEG;
  const trueElevation = 90 - zenith;
  const elevationDeg = trueElevation + refraction(trueElevation);

  // Azimuth clockwise from north.
  let azimuthDeg: number;
  const denominator = Math.cos(latRad) * Math.sin(zenith * RAD);
  if (Math.abs(denominator) > 1e-9) {
    const cosAz =
      (Math.sin(latRad) * Math.cos(zenith * RAD) - Math.sin(decRad)) / denominator;
    const az = Math.acos(Math.min(1, Math.max(-1, cosAz))) * DEG;
    azimuthDeg = hourAngle > 0 ? (az + 180) % 360 : (540 - az) % 360;
  } else {
    azimuthDeg = latitude > 0 ? 180 : 0;
  }

  return {
    elevationDeg,
    azimuthDeg,
    declinationDeg: declination,
    hourAngleDeg: hourAngle,
    rising: hourAngle < 0,
  };
}

// ── Phases ────────────────────────────────────────────────────────────────

export type LightingPhase =
  | "night"
  | "astronomical-twilight"
  | "nautical-twilight"
  | "civil-twilight"
  | "sunrise"
  | "morning"
  | "midday"
  | "afternoon"
  | "golden-hour"
  | "sunset"
  | "evening";

/** Human wording, for the status line and for the accessibility text. */
export const PHASE_LABEL: Record<LightingPhase, string> = {
  night: "Night",
  "astronomical-twilight": "Astronomical twilight",
  "nautical-twilight": "Nautical twilight",
  "civil-twilight": "First light",
  sunrise: "Sunrise",
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  "golden-hour": "Golden hour",
  sunset: "Sunset",
  evening: "Dusk",
};

/** Elevation at which the sun's upper limb touches the horizon. */
export const HORIZON_ELEVATION = -0.833;
export const CIVIL_ELEVATION = -6;
export const NAUTICAL_ELEVATION = -12;
export const ASTRONOMICAL_ELEVATION = -18;

/**
 * Phase from elevation and time of day.
 *
 * The bands are the standard twilight definitions, which is what makes this
 * defensible rather than decorative: civil twilight really does end at −6°.
 * The only judgement calls are the split between morning and midday (the sun
 * within an hour and a half of the meridian, and high) and the golden hour,
 * which is the descending 6°–12° band — the ascending one is plain morning,
 * because the sun is heading away from the horizon rather than towards it.
 */
export function phaseFor(position: SolarPosition): LightingPhase {
  const { elevationDeg: elevation, rising } = position;
  if (elevation < ASTRONOMICAL_ELEVATION) return "night";
  if (elevation < NAUTICAL_ELEVATION) return "astronomical-twilight";
  if (elevation < CIVIL_ELEVATION) return "nautical-twilight";
  if (elevation < HORIZON_ELEVATION) return rising ? "civil-twilight" : "evening";
  if (elevation < 6) return rising ? "sunrise" : "sunset";
  if (elevation >= 12 && Math.abs(position.hourAngleDeg) < 22.5) return "midday";
  if (elevation < 12) return rising ? "morning" : "golden-hour";
  return rising ? "morning" : "afternoon";
}

// ── Light pollution ───────────────────────────────────────────────────────

interface SkyGlowSource {
  name: string;
  lat: number;
  lon: number;
  /** Glow at the centre, 0–1. */
  strength: number;
  /** Kilometres at which the glow has essentially gone. */
  reachKm: number;
}

/**
 * Towns on or near the corridor, and how much sky they light.
 *
 * Strengths are ordered by population and industry, not measured: they are a
 * stated modelling choice, not a claim about lux. What they encode is the one
 * fact the ride has to get right — that between De Aar and Beaufort West there
 * is nothing, and the sky there is as dark as it gets in this country, while
 * Johannesburg and Cape Town wash theirs out entirely.
 */
export const SKY_GLOW_SOURCES: SkyGlowSource[] = [
  { name: "Pretoria / Johannesburg", lat: -25.87, lon: 28.13, strength: 1, reachKm: 120 },
  { name: "Klerksdorp", lat: -26.86, lon: 26.67, strength: 0.42, reachKm: 45 },
  { name: "Kimberley", lat: -28.74, lon: 24.76, strength: 0.46, reachKm: 50 },
  { name: "De Aar", lat: -30.65, lon: 24.01, strength: 0.22, reachKm: 25 },
  { name: "Beaufort West", lat: -32.36, lon: 22.58, strength: 0.2, reachKm: 22 },
  { name: "Worcester", lat: -33.65, lon: 19.44, strength: 0.34, reachKm: 35 },
  { name: "Cape Town", lat: -33.92, lon: 18.42, strength: 0.95, reachKm: 90 },
];

const EARTH_KM_PER_DEG_LAT = 110.574;

function approximateKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * EARTH_KM_PER_DEG_LAT;
  const dLon = (aLon - bLon) * 111.32 * Math.cos(((aLat + bLat) / 2) * RAD);
  return Math.hypot(dLat, dLon);
}

/**
 * How washed-out the night sky is at a point: 0 is a true dark sky, 1 is a
 * city. Sources add rather than overwrite, because a train between two towns
 * sees both.
 */
export function skyGlowAt(latitude: number, longitude: number): number {
  let glow = 0;
  for (const source of SKY_GLOW_SOURCES) {
    const distance = approximateKm(latitude, longitude, source.lat, source.lon);
    if (distance >= source.reachKm) continue;
    const falloff = 1 - distance / source.reachKm;
    glow += source.strength * falloff * falloff;
  }
  return Math.min(1, glow);
}

// ── Colour helpers ────────────────────────────────────────────────────────

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Linear ramp from a to b, clamped, used for every continuous transition. */
export function ramp(value: number, from: number, to: number): number {
  if (to === from) return value >= to ? 1 : 0;
  return clamp01((value - from) / (to - from));
}

/** Smooth version of the same, so nothing in the sky changes with a corner. */
export function smoothRamp(value: number, from: number, to: number): number {
  const t = ramp(value, from, to);
  return t * t * (3 - 2 * t);
}

/** Mix two 0xRRGGBB colours per channel. */
export function mixColour(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

// ── The lighting state the scene consumes ─────────────────────────────────

export interface LightingState {
  phase: LightingPhase;
  label: string;
  elevationDeg: number;
  azimuthDeg: number;
  /** 0 fully dark, 1 full daylight. Everything below interpolates on this. */
  dayFactor: number;
  /** Unit vector towards the sun, in the scene frame: +x east, +y up, +z south. */
  sunDirection: { x: number; y: number; z: number };
  sunColour: number;
  sunIntensity: number;
  skyColour: number;
  groundColour: number;
  hemisphereIntensity: number;
  fogColour: number;
  fogNear: number;
  fogFar: number;
  backgroundColour: number;
  exposure: number;
  /** Three.js Sky uniforms, so dusk is hazy and midday is not. */
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  /** 0–1. Carriage lamps come up as the outside goes down. */
  interiorLight: number;
  /** 0 dark sky, 1 city. Stars are scaled by the inverse of this. */
  skyGlow: number;
  starVisibility: number;
  /** True when the position could not be computed and the fallback is showing. */
  fallback: boolean;
}

const SUN_DAY = 0xfff5ea;
const SUN_GOLDEN = 0xffb46a;
const SUN_HORIZON = 0xff7a3c;
const SKY_DAY = 0xbcd8f2;
const SKY_DUSK = 0x6a6f95;
const SKY_NIGHT = 0x0b1026;
const GROUND_DAY = 0x9c9482;
const GROUND_NIGHT = 0x0e1018;
const HORIZON_DAY = 0xbcc9d6;
const HORIZON_DUSK = 0xd9866a;
const HORIZON_NIGHT = 0x080c1c;
const CITY_GLOW = 0x2a2438;

export interface LightingOptions {
  /**
   * Cap on every light, 0–1, for a device that cannot afford a bright frame or
   * a rider who has asked for less contrast. Defaults to 1.
   */
  brightness?: number;
  /** Sky glow, if the caller has already computed it for this position. */
  skyGlow?: number;
}

/**
 * The whole lighting state for an instant and a point on the line.
 *
 * Every value is continuous in the sun's elevation, so the scene never jumps:
 * the phase name changes at the standard boundaries, but the colours either
 * side of a boundary are the same colours.
 */
export function lightingFor(
  position: SolarPosition,
  latitude: number,
  longitude: number,
  options: LightingOptions = {},
): LightingState {
  const brightness = clamp01(options.brightness ?? 1);
  const elevation = position.elevationDeg;
  const phase = phaseFor(position);

  // Daylight comes up through the civil-twilight band and is complete a few
  // degrees above the horizon.
  const dayFactor = smoothRamp(elevation, CIVIL_ELEVATION, 8);
  // Separate, slower ramp for how deep the night is: full dark below −18°.
  const nightDepth = 1 - smoothRamp(elevation, ASTRONOMICAL_ELEVATION, HORIZON_ELEVATION);
  // How close to the horizon the sun is, for the warm colours.
  const lowSun = 1 - smoothRamp(elevation, 0, 14);

  const azRad = position.azimuthDeg * RAD;
  const elRad = Math.max(elevation, HORIZON_ELEVATION) * RAD;
  const cosEl = Math.cos(elRad);
  const sunDirection = {
    x: Math.sin(azRad) * cosEl,
    y: Math.sin(elRad),
    z: -Math.cos(azRad) * cosEl,
  };

  const sunColour = mixColour(
    SUN_DAY,
    elevation < 3 ? SUN_HORIZON : SUN_GOLDEN,
    lowSun * (elevation < 3 ? 1 : 0.85),
  );
  // Moonless night still is not pitch black on open ground; 0.04 is the floor
  // that keeps the rails readable without pretending it is dusk.
  const sunIntensity = (0.04 + 1.41 * dayFactor) * brightness;

  const glow = clamp01(options.skyGlow ?? skyGlowAt(latitude, longitude));

  const nightSky = mixColour(SKY_NIGHT, CITY_GLOW, glow * 0.8);
  const nightHorizon = mixColour(HORIZON_NIGHT, CITY_GLOW, glow * 0.9);

  const skyColour = mixColour(mixColour(nightSky, SKY_DUSK, smoothRamp(elevation, ASTRONOMICAL_ELEVATION, 0)), SKY_DAY, dayFactor);
  const groundColour = mixColour(GROUND_NIGHT, GROUND_DAY, dayFactor);
  const hemisphereIntensity = (0.1 + 0.12 * glow * nightDepth + 1.05 * dayFactor) * brightness;

  const duskHorizon = mixColour(nightHorizon, HORIZON_DUSK, smoothRamp(elevation, NAUTICAL_ELEVATION, 1));
  const fogColour = mixColour(duskHorizon, HORIZON_DAY, smoothRamp(elevation, 1, 12));

  return {
    phase,
    label: PHASE_LABEL[phase],
    elevationDeg: elevation,
    azimuthDeg: position.azimuthDeg,
    dayFactor,
    sunDirection,
    sunColour,
    sunIntensity,
    skyColour,
    groundColour,
    hemisphereIntensity,
    fogColour,
    // Night air is clearer than day haze, but you can see far less of it. The
    // fog closes in so the unlit terrain ring fades out instead of ending.
    fogNear: 2600 + 5400 * dayFactor,
    fogFar: 7000 + 13000 * dayFactor,
    backgroundColour: fogColour,
    // Tone mapping has to lift at night or the whole frame is crushed to black
    // on a phone in daylight, which is where this app is actually used.
    exposure: 1.08 + 0.34 * nightDepth,
    turbidity: 2.4 + 5.6 * lowSun,
    rayleigh: 0.9 + 2.6 * lowSun,
    mieCoefficient: 0.004 + 0.008 * lowSun,
    mieDirectionalG: 0.8,
    interiorLight: clamp01(1 - smoothRamp(elevation, -2, 7)),
    skyGlow: glow,
    starVisibility: clamp01(nightDepth * (1 - glow * 0.85)),
    fallback: false,
  };
}

/**
 * Lighting for an instant, computing the sun's position first.
 *
 * This is the one call the scene makes per frame-group.
 */
export function lightingAt(
  at: Date,
  latitude: number,
  longitude: number,
  options: LightingOptions = {},
): LightingState {
  if (
    !(at instanceof Date) ||
    Number.isNaN(at.getTime()) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return fallbackLighting(options);
  }
  try {
    const position = solarPosition(at, latitude, longitude);
    if (!Number.isFinite(position.elevationDeg) || !Number.isFinite(position.azimuthDeg)) {
      return fallbackLighting(options);
    }
    return lightingFor(position, latitude, longitude, options);
  } catch {
    return fallbackLighting(options);
  }
}

/**
 * What the scene shows when the calculation cannot be trusted.
 *
 * Deterministic mid-morning SAST light over the middle of the corridor. A
 * failed sun must never leave a rider in the dark wondering whether the app
 * has crashed, so the fallback is unmistakably daylight — and it says so, via
 * `fallback: true`, so the interface can tell them the time of day is not
 * being tracked rather than quietly lying about it.
 */
export function fallbackLighting(options: LightingOptions = {}): LightingState {
  const reference = new Date(
    Date.UTC(2026, 0, 15, 9, 0, 0) - RAILWAY_UTC_OFFSET_MINUTES * 60_000,
  );
  const state = lightingFor(
    solarPosition(reference, -30.65, 24.01),
    -30.65,
    24.01,
    options,
  );
  return { ...state, fallback: true };
}

export const FALLBACK_NOTICE =
  "Time of day could not be calculated, so the ride is lit as mid-morning.";
