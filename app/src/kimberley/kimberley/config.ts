import type { HistoricalBeat } from "../core/types.js";

export const KIMBERLEY_CONFIG = {
  chapterId: "kimberley-rails-to-diamonds",
  cityProfile: "kimberley-northern-cape",

  featureFlags: {
    interactiveTimeMachine: true,
    tramPhotoMoment: true,
    diamondInteraction: true,
    passportReward: true,
    adaptiveQuality: true,
    heroSceneFallback: true,
  },

  assets: {
    station: "kimberley-station",
    tram: "kimberley-heritage-tram",
    heritageProps: "kimberley-heritage-props",
    bigHole: "kimberley-big-hole",
    bigHoleFallback: "kimberley-big-hole-map-fallback",
    diamondParticles: "kimberley-diamond-particles",
  },

  routes: {
    tram: "kimberley-tram-route",
  },

  cameraPaths: {
    stationArrival: "kimberley-station-arrival",
    heritageReveal: "kimberley-heritage-reveal",
    tramRide: "kimberley-tram-cinematic",
    tramPhoto: "kimberley-tram-photo",
    bigHoleReveal: "kimberley-big-hole-reveal",
    bigHoleDescent: "kimberley-big-hole-descent",
    bigHoleFallback: "kimberley-big-hole-fallback-orbit",
    returnToTrain: "kimberley-return-to-train",
  },

  groups: {
    modern: "kimberley-modern",
    heritage: "kimberley-heritage",
    heritageCrowd: "kimberley-heritage-crowd",
  },

  environments: {
    presentDay: "kimberley-present-day",
    heritage: "kimberley-heritage-1880s",
    bigHole: "kimberley-big-hole-focus",
  },

  lighting: {
    approach: "kimberley-warm-afternoon",
    heritage: "kimberley-heritage-warm",
    bigHole: "kimberley-big-hole-dramatic",
    return: "kimberley-golden-departure",
  },

  weather: {
    approach: "kimberley-dry-clear",
    heritage: "kimberley-dust-light",
  },

  durations: {
    approachMs: 6500,
    stationCardMs: 1800,
    heritageMorphMs: 3200,
    timeMachineAutoMs: 3200,
    tramRideMs: 10500,
    tramPhotoHoldMs: 900,
    bigHoleRevealTransitionMs: 1600,
    historyBeatMs: 1200,
    diamondPromptTimeoutMs: 7000,
    returnToTrainMs: 2400,
  },

  train: {
    approachKph: 45,
    platformKph: 12,
    departureKph: 58,
  },

  tramStoryCues: [
    { progress01: 0.18, id: "tram-bell", caption: "The tram becomes our guide through heritage Kimberley.", audioCue: "tram-bell", effectId: "tram-wheel-glint" },
    { progress01: 0.48, id: "heritage-postcard", caption: "A moving postcard of the city's heritage streets.", audioCue: "heritage-street-bed", effectId: "heritage-film-flicker" },
    { progress01: 0.78, id: "big-hole-approach", caption: "The city opens toward its defining mining landscape.", audioCue: "big-hole-approach", effectId: "dust-wind-sweep" },
  ],

  history: [
    {
      year: 1871,
      title: "Diamond rush",
      body: "The discovery story begins. Keep this caption concise and source it in the final content layer.",
      depth01: 0.15,
      audioCue: "history-1871",
      effectId: "history-depth-pulse",
    },
    {
      year: 1887,
      title: "Tram era",
      body: "Kimberley's tram heritage becomes part of the journey narrative.",
      depth01: 0.40,
      audioCue: "history-1887",
      effectId: "history-depth-pulse",
    },
    {
      year: 1900,
      title: "Industrial mining",
      body: "The visual language shifts toward a more industrial mining story beat.",
      depth01: 0.67,
      audioCue: "history-1900",
      effectId: "history-depth-pulse",
    },
    {
      year: 1914,
      title: "Mining ends",
      body: "The descent reaches the final historical marker before the diamond interaction.",
      depth01: 0.92,
      audioCue: "history-1914",
      effectId: "history-depth-pulse",
    },
  ] satisfies HistoricalBeat[],

  rewards: {
    stampId: "rail-passport-kimberley",
    label: "Kimberley — Rails to Diamonds",
  },
} as const;
