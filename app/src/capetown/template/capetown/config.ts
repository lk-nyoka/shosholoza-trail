import type { JourneyStopSummary, PanoramaPoint } from "../core/types.js";

export const CAPE_TOWN = {
  places: {
    station: {
      id: "cape-town-station",
      name: "Cape Town Station",
      coordinates: [18.42639, -33.92219] as [number, number],
    },
    boKaap: {
      id: "bo-kaap",
      name: "Bo-Kaap",
      coordinates: [18.4130, -33.9200] as [number, number],
    },
    tableMountainCableway: {
      id: "table-mountain-cableway",
      name: "Table Mountain Aerial Cableway",
      coordinates: [18.4019, -33.9520] as [number, number],
    },
    waterfront: {
      id: "va-waterfront",
      name: "V&A Waterfront",
      coordinates: [18.42392, -33.90602] as [number, number],
    },
  },

  assets: {
    station: "cape-town-station",
    cityHero: "cape-town-city-bowl",
    boKaap: "bo-kaap-hero",
    cableCar: "table-mountain-cable-car",
    mountain: "table-mountain-hero",
    summit: "table-mountain-summit",
    waterfront: "va-waterfront-hero",
    fallbackMountain: "table-mountain-lite",
  },

  routes: {
    cableway: "table-mountain-cableway-path",
  },

  camera: {
    mountainApproach: "cape-town-mountain-approach",
    stationArrival: "cape-town-station-arrival",
    cityUnfold: "cape-town-city-unfold",
    boKaap: "cape-town-bo-kaap-colour",
    cableTransfer: "cape-town-cableway-transfer",
    cableAscent: "cape-town-cableway-ascent",
    summitReveal: "cape-town-summit-reveal",
    mountainToSea: "cape-town-mountain-to-sea",
    waterfront: "cape-town-waterfront-arrival",
    sunsetFinale: "cape-town-sunset-finale",
    recap: "cape-town-journey-recap",
  },

  environments: {
    approach: "cape-town-approach",
    station: "cape-town-station",
    city: "cape-town-city-bowl",
    boKaap: "cape-town-bo-kaap",
    mountain: "table-mountain",
    summit: "table-mountain-summit",
    waterfront: "cape-town-waterfront",
    sunset: "cape-town-sunset",
  },

  groups: {
    city: "cape-town-city",
    boKaap: "bo-kaap-detail",
    mountainClouds: "tablecloth-clouds",
    waterfront: "waterfront-detail",
  },

  durations: {
    preloadLeadMs: 500,
    mountainApproachMs: 7000,
    stationCardMs: 2200,
    cityUnfoldMs: 4400,
    boKaapMs: 7500,
    cableTransferMs: 3200,
    cableAscentMs: 11000,
    summitRevealMs: 4200,
    panoramaMs: 7000,
    mountainToSeaMs: 7000,
    waterfrontMs: 6000,
    sunsetMs: 5200,
    recapMomentMs: 1150,
  },

  train: {
    approachKph: 52,
    platformKph: 14,
  },

  panorama: [
    {
      id: "city-bowl",
      label: "City Bowl",
      coordinates: [18.423, -33.925],
      description: "Cape Town's central urban basin between mountain and sea.",
      category: "city",
    },
    {
      id: "bo-kaap",
      label: "Bo-Kaap",
      coordinates: [18.4130, -33.9200],
      description: "Historic neighbourhood on the slopes of Signal Hill.",
      category: "heritage",
    },
    {
      id: "waterfront",
      label: "V&A Waterfront",
      coordinates: [18.42392, -33.90602],
      description: "Working harbour and major visitor precinct.",
      category: "ocean",
    },
    {
      id: "robben-island",
      label: "Robben Island",
      coordinates: [18.3667, -33.8067],
      description: "Distant island visible across Table Bay in suitable conditions.",
      category: "island",
    },
  ] satisfies PanoramaPoint[],

  journeyStops: [
    { id: "pretoria", city: "Pretoria", label: "Departure", completed: true },
    { id: "johannesburg", city: "Johannesburg", label: "Urban chapter", completed: true },
    { id: "kimberley", city: "Kimberley", label: "Rails to Diamonds", completed: true },
    { id: "cape-town", city: "Cape Town", label: "Mountain to Sea", completed: true },
  ] satisfies JourneyStopSummary[],
} as const;
