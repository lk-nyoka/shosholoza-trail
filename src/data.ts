// Content data — imports canonical types from types/index.ts
import type { Stop, RailNode } from "./types";
import { snapToRoute, TOTAL_KM } from "./lib/routeIndex";

export type { Stop, RailNode };
export type { PlaceType, Place } from "./types";

export { TOTAL_KM };

const railNodesRaw: RailNode[] = [
  { name: "Pretoria",      km: 0,    lat: -25.7573, lon: 28.1866, station: true  },
  // Germiston used to sit here, and it is 13 km off the line now: the corridor
  // out of Pretoria follows the Gautrain alignment, which runs down the N1 side
  // and never touches the Germiston triangle. These are the stations it does
  // pass. km values are recomputed from lat/lon by snapToRoute below.
  { name: "Centurion",     km: 0,    lat: -25.8603, lon: 28.1894                 },
  { name: "Midrand",       km: 0,    lat: -25.9892, lon: 28.1265                 },
  { name: "Johannesburg",  km: 69,   lat: -26.1955, lon: 28.0416, station: true  },
  { name: "Potchefstroom", km: 190,  lat: -26.7145, lon: 27.0970                 },
  { name: "Klerksdorp",    km: 240,  lat: -26.8521, lon: 26.6667                 },
  { name: "Bloemhof",      km: 390,  lat: -27.6469, lon: 25.6069                 },
  { name: "Christiana",    km: 448,  lat: -27.9140, lon: 25.1611                 },
  { name: "Warrenton",     km: 508,  lat: -28.1130, lon: 24.8470                 },
  { name: "Kimberley",     km: 552,  lat: -28.7282, lon: 24.7499, station: true  },
  { name: "De Aar",        km: 788,  lat: -30.6497, lon: 24.0129, station: true  },
  { name: "Beaufort West", km: 1047, lat: -32.3568, lon: 22.5811, station: true  },
  { name: "Matjiesfontein",km: 1277, lat: -33.2167, lon: 20.5833, station: true  },
  { name: "Worcester",     km: 1425, lat: -33.6464, lon: 19.4487, station: true  },
  { name: "Wellington",    km: 1488, lat: -33.6398, lon: 19.0112                 },
  { name: "Bellville",     km: 1560, lat: -33.8943, lon: 18.6294                 },
  { name: "Cape Town",     km: 0,    lat: -33.9249, lon: 18.4241, station: true  },
];

/**
 * Photographs of the actual places, from Wikimedia Commons.
 *
 * These were Unsplash stock ids, and stock is the wrong tool for a route: the
 * Worcester card was a head of broccoli, De Aar was a laptop and a briefcase,
 * and Kimberley was a canyon in the American southwest. Commons has real,
 * freely-licensed photographs of these towns, filed under their own names, so
 * each card can show the thing it names.
 *
 * Special:FilePath serves the file and takes a width, so we get a sized
 * thumbnail rather than the full-resolution original.
 */
/**
 * Commons filenames contain brackets, and encodeURIComponent leaves those
 * alone — which is enough to end an unquoted CSS url() early and blank the
 * element. Encode them here so a filename can never break a stylesheet.
 */
const encodePath = (file: string) =>
  encodeURIComponent(file).replace(/\(/g, "%28").replace(/\)/g, "%29");

const img = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodePath(file)}?width=900`;

const stopsRaw: Stop[] = [
  {
    id: "pretoria", name: "Pretoria", province: "Gauteng",
    km: 0, lat: -25.7573, lon: 28.1866,
    teaser: "Jacarandas, monuments and makers in the capital.",
    places: [
      { id: "union",   name: "Union Buildings",     category: "Landmark",     type: "attraction", distance: "3.8 km", rating: 4.7, blurb: "Terraced gardens and panoramic city views from Meintjieskop.",             image: img("Union Buildings Pretoria 03.jpg"), featured: true },
      { id: "market",  name: "Church Square Makers",category: "Craft market", type: "vendor",     distance: "1.2 km", rating: 4.6, price: "R",  blurb: "Locally made beadwork, prints and small-batch gifts.",          image: img("Church Square Pretoria.jpg") },
      { id: "freedom", name: "Freedom Park",        category: "Culture",      type: "attraction", distance: "4.1 km", rating: 4.6, blurb: "A reflective journey through South Africa's history.",                      image: img("Freedom Park-333.jpg") },
    ],
  },
  {
    id: "johannesburg", name: "Johannesburg", province: "Gauteng",
    km: 69, lat: -26.1955, lon: 28.0416,
    teaser: "Gold-rush history meets contemporary city culture.",
    places: [
      { id: "maboneng",     name: "Maboneng Precinct",       category: "Arts district", type: "attraction", distance: "2.4 km", rating: 4.5, blurb: "Street art, galleries, cafés and weekend energy.",                                image: img("Maboneng Art Installation Median.jpg"), featured: true },
      { id: "rosebank",     name: "Rosebank Sunday Market",  category: "Market",        type: "vendor",     distance: "8.7 km", rating: 4.6, price: "RR", blurb: "African crafts, food stalls and rooftop city views.",             image: img("Clothes stalls at the Rosebank Sunday Market June 2026.jpg") },
      { id: "constitution", name: "Constitution Hill",       category: "Heritage",      type: "attraction", distance: "3.1 km", rating: 4.7, blurb: "A living museum telling the story of democracy.",                              image: img("Eternal Flame on Constitution Hill in Johannesburg.JPG") },
    ],
  },
  {
    id: "kimberley", name: "Kimberley", province: "Northern Cape",
    km: 552, lat: -28.7282, lon: 24.7499,
    teaser: "Diamond history and wide Northern Cape skies.",
    places: [
      { id: "bighole",      name: "The Big Hole",            category: "Heritage",      type: "attraction", distance: "1.8 km", rating: 4.5, blurb: "Explore the open-air museum at the heart of diamond history.",               image: img("Big Hole, Kimberley, Northern Cape, South Africa (20512571296).jpg"), featured: true },
      { id: "diamondcraft", name: "Diamond City Collective", category: "Craft studio",  type: "vendor",     distance: "1.5 km", rating: 4.8, price: "RR", blurb: "Northern Cape ceramics, leatherwork and textiles.",              image: img("McGregor Museum, Kimberley, Northern Cape, South Africa (20531739632).jpg") },
    ],
  },
  {
    id: "de-aar", name: "De Aar", province: "Northern Cape",
    km: 788, lat: -30.6497, lon: 24.0129,
    teaser: "A legendary rail junction beneath the Karoo sky.",
    places: [
      { id: "rail",    name: "Railway Heritage Walk", category: "History",    type: "attraction", distance: "0.6 km", rating: 4.3, blurb: "Follow the town's story through its railway landmarks.",                    image: img("Station De Aar.JPG"), featured: true },
      { id: "padstal", name: "Karoo Pantry",          category: "Food",       type: "vendor",     distance: "1.1 km", rating: 4.7, price: "R",  blurb: "Fresh roosterkoek, preserves and road-trip favourites.",           image: img("051. 1980-12. De Aar Station, platform 1 - SAR..jpg") },
    ],
  },
  {
    id: "beaufort", name: "Beaufort West", province: "Western Cape",
    km: 1047, lat: -32.3568, lon: 22.5811,
    teaser: "Karoo wilderness, fossils and clear night skies.",
    places: [
      { id: "karoo", name: "Karoo National Park", category: "Nature",      type: "attraction", distance: "7.5 km", rating: 4.7, blurb: "Dramatic koppies, wildlife and quiet Karoo landscapes.",                    image: img("Karoo National Park.jpg"), featured: true },
      { id: "salt",  name: "Salt & Stone Deli",   category: "Local food",  type: "vendor",     distance: "1.4 km", rating: 4.8, price: "RR", blurb: "Karoo lamb, preserves and artisan picnic boxes.",                 image: img("Beaufort West Arts & Crafts - Central Karoo, South Africa (3918405939).jpg") },
    ],
  },
  {
    id: "matjies", name: "Matjiesfontein", province: "Western Cape",
    km: 1277, lat: -33.2167, lon: 20.5833,
    teaser: "A one-street Victorian village frozen in time.",
    places: [
      { id: "milner", name: "Lord Milner Hotel", category: "Heritage", type: "attraction", distance: "0.2 km", rating: 4.6, blurb: "Step into a beautifully preserved Victorian landmark.",           image: img("9 2 058 0001-Lord Milner-Matjiesfontein-s.jpg"), featured: true },
      { id: "pantry", name: "The Coffee House",  category: "Café",     type: "vendor",     distance: "0.1 km", rating: 4.5, price: "R",  blurb: "Homemade bakes and coffee beside the platform.",      image: img("Matjiesfontein Lord Milner Hotel 2.JPG") },
    ],
  },
  {
    id: "worcester", name: "Worcester", province: "Western Cape",
    km: 1425, lat: -33.6464, lon: 19.4487,
    teaser: "Vineyards and orchards framed by mountains.",
    places: [
      { id: "garden", name: "Karoo Desert Garden",  category: "Nature",   type: "attraction", distance: "3.2 km", rating: 4.6, blurb: "Rare succulents and sweeping views over the valley.",             image: img("Typical Robertson Karoo vegetation - Worcester.jpg"), featured: true },
      { id: "valley", name: "Breede Valley Pantry", category: "Produce",  type: "vendor",     distance: "2.1 km", rating: 4.8, price: "RR", blurb: "Local fruit, wine, preserves and farm-made goods.",  image: img("WorcesterWC-HighStreet.jpg") },
    ],
  },
  {
    id: "cape-town", name: "Cape Town", province: "Western Cape",
    km: 0, lat: -33.9249, lon: 18.4241,
    teaser: "Mountain, ocean and a city alive with creativity.",
    places: [
      { id: "table",     name: "Table Mountain",  category: "Nature",         type: "attraction", distance: "6.8 km", rating: 4.9, blurb: "Ride the cableway or hike to an unforgettable panorama.",          image: img("Cape Town (ZA), Table Mountain -- 2024 -- 2821.jpg"), featured: true },
      { id: "watershed", name: "The Watershed",   category: "Design market",  type: "vendor",     distance: "2.9 km", rating: 4.7, price: "RR", blurb: "Independent South African design under one roof.",       image: img("Waterfront - Clocktower (Cape Town).jpg") },
      { id: "bo-kaap",   name: "Bo-Kaap Walk",    category: "Culture",        type: "attraction", distance: "2.2 km", rating: 4.7, blurb: "Colourful streets, Cape Malay heritage and food stories.",          image: img("Chiappini Street, Bo-Kaap (01).jpg") },
    ],
  },
];

/**
 * Station km measured along the mapped rail geometry rather than estimated by
 * hand, so the 3D ride puts the train at the actual station - Johannesburg at
 * Park Station in Braamfontein, not at a round number 14 km away.
 */
export const railNodes: RailNode[] = snapToRoute(railNodesRaw);
export const stops: Stop[] = snapToRoute(stopsRaw);

/**
 * The photograph that stands for a stop on the browsing pages.
 *
 * Home, Destinations and Stories used to carry their own Unsplash stock ids,
 * which is how Worcester ended up as a mountain valley and Kimberley as a
 * canyon in the American southwest. The stop's own featured place already has
 * a verified Commons photograph of the real town, so those pages read it from
 * here instead of keeping a second, unchecked list.
 */
export const stopHero = (id: string): string => {
  const places = stops.find((s) => s.id === id)?.places ?? [];
  return (places.find((p) => p.featured) ?? places[0])?.image ?? "";
};

/**
 * The route length, written the way the site writes numbers.
 *
 * The pages used to carry a hand-typed "1 582" while the mapped geometry
 * measured something else, so the marketing number and the ride disagreed with
 * each other. Everything user-facing now reads this, and it can only ever say
 * what the route actually measures.
 */
export const ROUTE_KM_LABEL = String(Math.round(TOTAL_KM))
  .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
