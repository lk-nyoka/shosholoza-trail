/**
 * What is actually near each station.
 *
 * The eight editorial place cards are chosen and written; this is the rest of
 * the town — every named shop, café, bank, fuel stop, museum and memorial
 * within walking distance of the stop, pulled from OpenStreetMap.
 *
 * It exists because of the two-to-forty-five-minute problem. A passenger with
 * eight minutes does not need a curated recommendation four kilometres away,
 * they need to know there is a Checkers 230 m from the platform. Nothing here
 * is written by us: the names and categories are as mapped by OSM contributors,
 * there are no ratings and no descriptions, because inventing either would make
 * a directory of real businesses into fiction.
 *
 * Collected September 2026 from the Overpass API. Data © OpenStreetMap
 * contributors, ODbL 1.0 — the same licence as the railway geometry.
 *
 * Entries carry either a position, in which case the walking distance is
 * measured from the stop at runtime, or a distance already measured from the
 * town centre where the station sits.
 */
export type NearbyKind =
  | "cafe" | "restaurant" | "fast_food" | "bakery" | "bar" | "pub" | "ice_cream"
  | "supermarket" | "convenience" | "butcher" | "greengrocer" | "deli" | "marketplace"
  | "clothes" | "shoes" | "books" | "gift" | "craft" | "jewelry" | "variety_store"
  | "department_store" | "alcohol" | "florist" | "antiques" | "farm"
  | "pharmacy" | "bank" | "atm" | "fuel" | "post_office"
  | "museum" | "attraction" | "artwork" | "gallery" | "viewpoint"
  | "memorial" | "monument" | "ruins" | "information" | "hotel" | "guest_house"
  | "place_of_worship";

export interface NearbyPlace {
  /** Name as mapped in OpenStreetMap. */
  n: string;
  k: NearbyKind;
  /** Position, where we have it. */
  la?: number;
  lo?: number;
  /** Distance in km, where the entry was measured rather than positioned. */
  d?: number;
  /** OSM cuisine or craft tag, when present. */
  c?: string;
}

type Row = [string, NearbyKind, number, number, string] | [string, NearbyKind, number, string];

const positioned = (rows: Row[]): NearbyPlace[] =>
  rows.map(r => (r.length === 5
    ? { n: r[0], k: r[1], la: r[2] as number, lo: r[3] as number, c: (r[4] as string) || undefined }
    : { n: r[0], k: r[1], d: r[2] as number, c: (r[3] as string) || undefined }));

export const NEARBY: Record<string, NearbyPlace[]> = {
  pretoria: positioned([
    ["PLTFRM","cafe",0.32,""],["Wild Bean Cafe","cafe",0.38,"coffee_shop"],
    ["Andries Pretorius Statue","monument",0.5,""],["Downtown Church of Christ","place_of_worship",0.7,""],
    ["GTL","fuel",0.95,""],["Kariba","restaurant",1.11,""],["African Bank","bank",1.15,""],
    ["May May","bar",1.15,""],["Riche","cafe",1.18,""],["Tramshed Post Office","post_office",1.18,""],
    ["Pick n Pay","supermarket",1.2,""],["Paul Kruger Statue","artwork",1.21,""],
    ["McDonald's","fast_food",1.26,"burger"],["Markham Relay","clothes",1.27,""],
    ["Exact","clothes",1.27,""],["Van Schaik","books",1.34,""],
    ["House 22 Pub&Grill","bar",1.35,""],["Edgars","department_store",1.36,""],
    ["Hungry Lion","fast_food",1.38,"chicken"],
  ]),
  johannesburg: positioned([
    ["Park Station Inn","hotel",0.05,""],["Burger King","fast_food",0.07,"burger;chicken"],
    ["Honey Bites","fast_food",0.07,"pie"],["Krispy Kreme","fast_food",0.08,"donut"],
    ["Debonnair's Pizza","fast_food",0.09,"pizza"],["YMCA","hotel",0.14,""],
    ["ABSA","bank",0.14,""],["Dis-Chem","pharmacy",0.17,""],
    ["The Miner's Monument","monument",0.3,""],["ANEW Hotel Parktonian","hotel",0.3,""],
    ["Fish N Cheap","restaurant",0.32,""],["Joburg City Pharmacy","pharmacy",0.32,""],
    ["Alpha Butchery","butcher",0.32,""],["M.O.T.H. War Memorial (WW1)","memorial",0.36,""],
    ["The Park Street Hotel","hotel",0.37,""],["The 1505 Bar and Restaurant","pub",0.4,""],
    ["Braamfontein Meat","butcher",0.41,""],["Braamfontein Post Office","post_office",0.5,""],
    ["The Cathedral of St Mary the Virgin","place_of_worship",0.51,""],
  ]),
  kimberley: positioned([
    ["Cafe 786","cafe",-28.73567,24.74486,""],["Star of the West","pub",-28.73618,24.75469,""],
    ["Tramways Café","cafe",-28.73685,24.75437,""],["Metcash","supermarket",-28.73154,24.76153,""],
    ["Australian Arms","pub",-28.73829,24.75461,""],["Occidental Bar","pub",-28.73813,24.75544,""],
    ["Open Mine Museum","museum",-28.73874,24.75528,""],["Open Mine Entry","attraction",-28.73916,24.7547,""],
    ["Kimberley Mine","viewpoint",-28.73906,24.75603,""],["Al-Rashid Butchery","butcher",-28.73505,24.76226,""],
    ["KFC","fast_food",-28.73116,24.76427,"chicken"],["Protea Hotel","hotel",-28.74022,24.75549,""],
    ["Big Hole Visitor Information Centre","information",-28.74072,24.75472,""],
    ["N12 Butchery Biltong Den","butcher",-28.73262,24.76426,""],["Big Hole","attraction",-28.73924,24.75855,""],
    ["Super Save Supermarket","supermarket",-28.73667,24.76208,""],["TotalEnergies","fuel",-28.72936,24.76546,""],
    ["Bonjour","convenience",-28.72918,24.76557,""],["Fourways Supermarket","supermarket",-28.73585,24.76332,""],
    ["Midnight Cafe","cafe",-28.73614,24.76337,""],["Mochachos","restaurant",-28.73578,24.76383,"chicken"],
    ["Munchies Pizza","restaurant",-28.72976,24.7663,""],
  ]),
  "de-aar": positioned([
    ["Premier Slagtery","butcher",-30.64934,24.0126,""],["Jet","clothes",-30.64986,24.01162,""],
    ["Clicks","pharmacy",-30.6494,24.01135,""],["Venotec Liquor Distributors","alcohol",-30.64876,24.01164,""],
    ["FNB","bank",-30.6494,24.01119,""],["Truworths","clothes",-30.64971,24.01101,""],
    ["PEP","clothes",-30.64996,24.011,""],["Checkers","supermarket",-30.64992,24.01049,""],
    ["Shoprite","supermarket",-30.65209,24.01123,""],["TotalEnergies","fuel",-30.6474,24.0109,""],
    ["Astron Energy","fuel",-30.65083,24.00928,""],["NG Kerk - De Aar","place_of_worship",-30.65336,24.00952,""],
    ["Sarelstad Drankwinkel","alcohol",-30.66433,24.01361,""],
  ]),
  beaufort: positioned([
    ["KFC","fast_food",-32.35713,22.58319,"chicken"],["BP","fuel",-32.35684,22.58341,""],
    ["Astron Energy","fuel",-32.35574,22.5833,""],["Clicks","pharmacy",-32.35792,22.58404,""],
    ["TotalEnergies","fuel",-32.35446,22.58373,""],["Bonjour","convenience",-32.3545,22.584,""],
    ["Steers","fast_food",-32.35436,22.58398,"burger"],["Pick n Pay","supermarket",-32.35893,22.58474,""],
    ["Exact","clothes",-32.35256,22.5826,""],["Foschini","clothes",-32.35255,22.5827,""],
    ["Standard Bank","bank",-32.35251,22.58247,""],["Tekkie Town","shoes",-32.35255,22.58278,""],
    ["Karushi","restaurant",-32.35248,22.58289,"pizza;coffee_shop;sushi"],
    ["Capitec Bank","bank",-32.35233,22.58245,""],["Checkers","supermarket",-32.35224,22.58244,""],
    ["Debonairs Pizza","fast_food",-32.35207,22.58242,"pizza"],["Nedbank","bank",-32.35198,22.58253,""],
    ["The Crazy Store","variety_store",-32.35197,22.58261,""],["Rage","shoes",-32.35196,22.58271,""],
    ["The Fish & Chip Co.","fast_food",-32.35195,22.58281,"fish_and_chips"],
    ["Hungry Lion","fast_food",-32.35188,22.58283,"chicken"],
    ["NG Kerk - Gamka Oos","place_of_worship",-32.35867,22.58635,""],
    ["Beaufort West Museum","museum",-32.35986,22.58347,""],
  ]),
  matjies: positioned([
    ["Pink Church","place_of_worship",-33.23024,20.58276,""],
    ["Travellers Chapel","place_of_worship",-33.23028,20.58184,""],
    ["Lord Milner Hotel","hotel",-33.23092,20.58218,""],
    ["Transport Museum","museum",-33.23106,20.58327,""],
    ["Standard Bank Museum","museum",-33.23098,20.58147,""],
    ["The Coffee House","cafe",-33.23097,20.58126,""],
    ["Post Office Gift Shop","variety_store",-33.23101,20.58171,""],
    ["The Laird's Arms","pub",-33.23106,20.58191,""],
    ["Marie Rawdon Museum","museum",-33.23132,20.58081,""],
    ["Railway Museum","museum",-33.23136,20.58101,""],
  ]),
  worcester: positioned([
    ["Nedbank","bank",-33.64321,19.44763,""],["Viljoen's Jewelery","jewelry",-33.64324,19.4464,""],
    ["Quenets Pharmacy","pharmacy",-33.64339,19.44612,""],["Tops at Spar","alcohol",-33.64329,19.44628,""],
    ["Autobank","atm",-33.64245,19.44801,""],["First National","bank",-33.64227,19.44839,""],
    ["McDonald's","fast_food",-33.64202,19.44848,"burger"],["Cafe Hugo","cafe",-33.6428,19.44567,""],
    ["Daly Bread","bakery",-33.64284,19.44547,""],["Worcester Post Office","post_office",-33.64516,19.44355,""],
    ["Nelson Mandela","memorial",-33.64422,19.44384,""],["Voortrekker","monument",-33.64383,19.44355,""],
    ["Engen","fuel",-33.64156,19.45063,""],["Starpark","restaurant",-33.64189,19.4456,"sushi"],
    ["Debonairs Pizza","fast_food",-33.64102,19.45079,"pizza"],["BP","fuel",-33.64585,19.4419,""],
    ["Standard Bank","bank",-33.64445,19.44222,""],["Moeder","place_of_worship",-33.64262,19.44274,""],
    ["Shell","fuel",-33.64997,19.44244,""],["Astron Energy","fuel",-33.64668,19.44024,""],
    ["Christ the King Church","place_of_worship",-33.64354,19.43975,""],
    ["New Apostolic Church","place_of_worship",-33.6393,19.43898,""],
    ["The Barn","restaurant",-33.64658,19.43501,"regional"],
  ]),
  "cape-town": positioned([
    ["KFC","fast_food",0.06,"chicken"],["Texie's Fish & Chips","fast_food",0.09,""],
    ["Litekem Pharmacy","pharmacy",0.14,""],["Spar","supermarket",0.14,""],
    ["Eastern Food Bazaar","restaurant",0.17,"pizza;indian"],["Pizza Cafe","fast_food",0.18,""],
    ["Bakers City","fast_food",0.19,""],["PostNet","post_office",0.2,""],
    ["Cape Diamond Hotel","hotel",0.21,""],["Your Lunch Box","fast_food",0.22,""],
    ["Townhouse Hotel","hotel",0.25,""],["Shoprite","supermarket",0.25,""],
    ["PEP","clothes",0.25,""],["Ackermans","clothes",0.25,""],
    ["McDonald's","fast_food",0.26,"burger"],["Foschini","clothes",0.27,""],
    ["A. White Chemist","pharmacy",0.27,""],["Bread Milk & Honey","convenience",0.27,""],
    ["Great War Memorial Cross","memorial",0.27,""],["Wimpy","fast_food",0.28,"burger"],
    ["Chicken Licken","fast_food",0.31,"chicken"],["De Goewerneur","cafe",0.31,""],
  ]),
};

/** Plain-English category, because "fast_food" is a database value, not a word. */
export const KIND_LABEL: Record<NearbyKind, string> = {
  cafe: "Café", restaurant: "Restaurant", fast_food: "Takeaway", bakery: "Bakery",
  bar: "Bar", pub: "Pub", ice_cream: "Ice cream",
  supermarket: "Supermarket", convenience: "Convenience", butcher: "Butcher",
  greengrocer: "Greengrocer", deli: "Deli", marketplace: "Market",
  clothes: "Clothing", shoes: "Shoes", books: "Books", gift: "Gifts", craft: "Craft",
  jewelry: "Jewellery", variety_store: "Variety store", department_store: "Department store",
  alcohol: "Bottle store", florist: "Florist", antiques: "Antiques", farm: "Farm stall",
  pharmacy: "Pharmacy", bank: "Bank", atm: "ATM", fuel: "Fuel", post_office: "Post office",
  museum: "Museum", attraction: "Attraction", artwork: "Public artwork", gallery: "Gallery",
  viewpoint: "Viewpoint", memorial: "Memorial", monument: "Monument", ruins: "Ruins",
  information: "Information", hotel: "Hotel", guest_house: "Guest house",
  place_of_worship: "Place of worship",
};

/** The groups a passenger actually thinks in when the train stops. */
export type NearbyGroup = "food" | "shops" | "essentials" | "heritage";

const GROUP_OF: Partial<Record<NearbyKind, NearbyGroup>> = {
  cafe: "food", restaurant: "food", fast_food: "food", bakery: "food", bar: "food",
  pub: "food", ice_cream: "food", deli: "food", marketplace: "food",
  supermarket: "shops", convenience: "shops", butcher: "shops", greengrocer: "shops",
  clothes: "shops", shoes: "shops", books: "shops", gift: "shops", craft: "shops",
  jewelry: "shops", variety_store: "shops", department_store: "shops", alcohol: "shops",
  florist: "shops", antiques: "shops", farm: "shops",
  pharmacy: "essentials", bank: "essentials", atm: "essentials", fuel: "essentials",
  post_office: "essentials", hotel: "essentials", guest_house: "essentials",
  museum: "heritage", attraction: "heritage", artwork: "heritage", gallery: "heritage",
  viewpoint: "heritage", memorial: "heritage", monument: "heritage", ruins: "heritage",
  information: "heritage", place_of_worship: "heritage",
};

export const groupOf = (kind: NearbyKind): NearbyGroup => GROUP_OF[kind] ?? "shops";

export const GROUP_LABEL: Record<NearbyGroup, string> = {
  food: "Food & drink",
  shops: "Shops & markets",
  essentials: "Essentials",
  heritage: "Heritage & sights",
};

const EARTH_KM = 6371;

function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Distance from the stop, in km, however the entry was recorded. */
export function distanceFrom(place: NearbyPlace, stopLat: number, stopLon: number): number {
  if (place.d !== undefined) return place.d;
  if (place.la === undefined || place.lo === undefined) return Number.POSITIVE_INFINITY;
  return haversine(stopLat, stopLon, place.la, place.lo);
}

export function distanceLabel(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
