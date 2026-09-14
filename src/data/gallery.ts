/**
 * More than one photograph of each town.
 *
 * A single hero image tells a passenger almost nothing about a place they are
 * about to have eight minutes in. These are hand-picked from Wikimedia Commons
 * — picked rather than search-ranked, because a search for "De Aar" returns the
 * Aare river in Bern and a search for "Cape Town" returns a skink, and the last
 * thing this app needs is another Worcester-as-a-head-of-broccoli.
 *
 * Every file below names the place it shows. Licences are on each file page;
 * the credits page links them.
 */
/**
 * Commons filenames contain brackets, and encodeURIComponent leaves those
 * alone — which is enough to end an unquoted CSS url() early and blank the
 * element. Encode them here so a filename can never break a stylesheet.
 */
const encodePath = (file: string) =>
  encodeURIComponent(file).replace(/\(/g, "%28").replace(/\)/g, "%29");

const img = (file: string, width = 1200) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodePath(file)}?width=${width}`;

export interface Shot {
  url: string;
  /** What the photograph actually shows, for the caption and the alt text. */
  caption: string;
  file: string;
}

const shot = (file: string, caption: string): Shot => ({ url: img(file), caption, file });

export const GALLERY: Record<string, Shot[]> = {
  pretoria: [
    shot("Pretoria View of Central Pretoria from the bottom of the Voortrekker Monument staircase.jpg",
      "Central Pretoria, from the Voortrekker Monument"),
    shot("Jacaranda Trees, Becket Street Pretoria.jpg", "Jacarandas on Becket Street in October"),
    shot("Union Buildings Pretoria 03.jpg", "The Union Buildings on Meintjieskop"),
    shot("Pretoria Voortrekker Monument seen from the bottom of the stairs.jpg", "The Voortrekker Monument"),
    shot("Pretoria Station.JPG", "Pretoria station"),
    shot("Church Square Pretoria.jpg", "Church Square"),
    shot("Freedom Park-333.jpg", "Freedom Park"),
  ],
  johannesburg: [
    shot("A Johannesburg Summers Day.jpg", "The city on a summer afternoon"),
    shot("Ominous Sunset over Johannesburg.jpg", "Sunset over the skyline"),
    shot("Johannesburg-city-skyline-night.jpg", "The skyline at night"),
    shot("Maboneng Art Installation Median.jpg", "Maboneng"),
    shot("Johannesburg CBD.jpg", "The central business district"),
    shot("Eternal Flame on Constitution Hill in Johannesburg.JPG", "The eternal flame, Constitution Hill"),
  ],
  kimberley: [
    shot("Big Hole, Kimberley, Northern Cape, South Africa (20512571296).jpg", "The Big Hole"),
    shot("City Hall, DeBeers Road, Kimberley.jpg", "City Hall on De Beers Road"),
    shot("Historical tramway at Market Square Kimberley.jpeg", "The historic tram at Market Square"),
    shot("Downtown Kimberley seen from the west 2015.JPG", "Downtown, from the west"),
    shot("McGregor Museum, Kimberley, Northern Cape, South Africa (20531739632).jpg", "The McGregor Museum"),
  ],
  "de-aar": [
    shot("Station De Aar.JPG", "De Aar station"),
    shot("051. 1980-12. De Aar Station, platform 1 - SAR..jpg", "Platform 1, photographed in 1980"),
    shot("St. Pauls Church, De Aar.JPG", "St Paul's Church"),
  ],
  beaufort: [
    shot("Karoo National Park.jpg", "The Karoo National Park"),
    shot("Beaufort West Station.JPG", "Beaufort West station"),
    shot("Main Street, Beaufort West (14089710804).jpg", "Main Street"),
    shot("Old Town Hall Beaufort West 2.JPG", "The old town hall"),
    shot("Old Public Library Beaufort West.JPG", "The old public library"),
  ],
  matjies: [
    shot("9 2 058 0001-Lord Milner-Matjiesfontein-s.jpg", "The Lord Milner Hotel"),
    shot("Matjiesfontein street scene.jpg", "The single street"),
    shot("Road in Matjiesfontein.jpg", "Looking down the road"),
    shot("Matjiesfontein guardhouse.jpg", "The guardhouse"),
    shot("Matjiesfontein Lord Milner Hotel 2.JPG", "The hotel from the platform side"),
  ],
  worcester: [
    shot("WorcesterWC-HighStreet.jpg", "High Street"),
    shot("Typical Robertson Karoo vegetation - Worcester.jpg", "Robertson Karoo vegetation outside town"),
    shot("Slave bell over Market Square (Worcester, Western Cape - May 2009).jpg", "The slave bell over Market Square"),
    shot("Worcester,Western Cape - Beck House Baring Street.jpg", "Beck House on Baring Street"),
    shot("Good Hope Building, Worcester, Western Cape (May 2009).jpg", "The Good Hope Building"),
  ],
  "cape-town": [
    shot("Cape Town (ZA), Table Mountain -- 2024 -- 2821.jpg", "Table Mountain"),
    shot("Chiappini Street, Bo-Kaap (01).jpg", "Chiappini Street, Bo-Kaap"),
    shot("CapeTown CityHall.jpg", "The City Hall"),
    shot("Waterfront - Clocktower (Cape Town).jpg", "The Clock Tower at the Waterfront"),
  ],
};

/**
 * The homepage photograph: a Shosholoza Meyl train on this railway, rather than
 * a stock picture of a train somewhere else in the world.
 */
export const HERO: Shot = shot(
  "Shosholoza Meyl Trans Natal headed by 18-xxx and 18-422 near Balfour. (16993112398).jpg",
  "A Shosholoza Meyl train near Balfour",
);

export const shotsFor = (stopId: string): Shot[] => GALLERY[stopId] ?? [];
