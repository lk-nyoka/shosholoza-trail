/**
 * Every place the line runs through, and what is worth knowing about it.
 *
 * The scheduled stops are eight names across 1,568 km; between Kimberley and
 * De Aar alone the train is moving for over two hours with nothing to say. This
 * is the rest of it - cities, towns, villages and suburbs - pulled from the
 * OpenStreetMap `place` layer along the route rather than typed from memory, so
 * the coverage is complete and the coordinates are the ones the map itself
 * uses. Anything further from the line than a rider could reasonably be said to
 * be passing is dropped at load.
 *
 * `c` is the OSM place class: c city, t town, v village, s suburb.
 * `p` is the town or city a suburb belongs to.
 *
 * NOTES carries the history. Where a place has one, it is written out; where it
 * does not - and there are a lot of small suburbs here - the description is
 * derived from what is actually known about it rather than invented.
 */
import { kmAtLatLon } from "./routeIndex";
import { sideOfTrack, type TrackSide } from "./windowSide";

export type PlaceKind = "c" | "t" | "v" | "s";

interface Seed {
  n: string;
  c: PlaceKind;
  a: [number, number];
  p?: string;
}

const SEEDS: Seed[] = [
  { n: "Pretoria", c: "c", a: [-25.74594, 28.18791] },
  { n: "Pretoria Central", c: "s", a: [-25.75185, 28.18997], p: "Pretoria" },
  { n: "Salvokop", c: "s", a: [-25.76111, 28.18611], p: "Pretoria" },
  { n: "Trevenna", c: "s", a: [-25.74919, 28.20104], p: "Pretoria" },
  { n: "Sunnyside", c: "s", a: [-25.7575, 28.21223], p: "Pretoria" },
  { n: "Lukasrand", c: "s", a: [-25.76392, 28.20526], p: "Pretoria" },
  { n: "Muckleneuk", c: "s", a: [-25.7625, 28.21083], p: "Pretoria" },
  { n: "Glen Lauriston", c: "s", a: [-25.82533, 28.15575], p: "Centurion" },
  { n: "Clubview", c: "s", a: [-25.83389, 28.16833], p: "Centurion" },
  { n: "Lyttelton Manor", c: "s", a: [-25.82945, 28.20277], p: "Centurion" },
  { n: "Centurion", c: "t", a: [-25.83636, 28.18027] },
  { n: "Clubview East", c: "s", a: [-25.83846, 28.17072], p: "Centurion" },
  { n: "Hennopspark", c: "s", a: [-25.84972, 28.17417], p: "Centurion" },
  { n: "Doringkloof", c: "s", a: [-25.85639, 28.21027], p: "Irene" },
  { n: "Irene", c: "t", a: [-25.86841, 28.21795] },
  { n: "Zwartkop", c: "s", a: [-25.86723, 28.17639], p: "Centurion" },
  { n: "Bronberrik", c: "s", a: [-25.85917, 28.16833], p: "Centurion" },
  { n: "Rooihuiskraal-Noord", c: "s", a: [-25.87667, 28.14889], p: "Centurion" },
  { n: "Rooihuiskraal", c: "s", a: [-25.89334, 28.15139], p: "Centurion" },
  { n: "Noordwyk", c: "s", a: [-25.95306, 28.11944], p: "Midrand" },
  { n: "Diepsloot", c: "t", a: [-25.93095, 28.01059] },
  { n: "Randjespark", c: "s", a: [-25.97333, 28.1325], p: "Midrand" },
  { n: "Halfway House", c: "s", a: [-25.9949, 28.12892], p: "Midrand" },
  { n: "Midrand", c: "t", a: [-25.99925, 28.12594] },
  { n: "President Park", c: "s", a: [-26.00636, 28.14846], p: "Midrand" },
  { n: "Thembisa", c: "t", a: [-26.02216, 28.20148] },
  { n: "Buccleuch", c: "s", a: [-26.05528, 28.11084], p: "Midrand" },
  { n: "Kempton Park", c: "t", a: [-26.09641, 28.23366] },
  { n: "Kelvin", c: "s", a: [-26.075, 28.09472], p: "Sandton" },
  { n: "Eastgate", c: "s", a: [-26.08361, 28.09944], p: "Sandton" },
  { n: "Alexandra", c: "s", a: [-26.10444, 28.09889], p: "Sandton" },
  { n: "Marlboro", c: "s", a: [-26.09195, 28.09361], p: "Sandton" },
  { n: "Wendywood", c: "s", a: [-26.07944, 28.08361], p: "Sandton" },
  { n: "Wynberg", c: "s", a: [-26.1107, 28.08354], p: "Sandton" },
  { n: "Strathavon", c: "s", a: [-26.095, 28.07], p: "Sandton" },
  { n: "Sandown", c: "s", a: [-26.09195, 28.06583], p: "Sandton" },
  { n: "Atholl Gardens", c: "s", a: [-26.11139, 28.06805], p: "Sandton" },
  { n: "Benmore Gardens", c: "s", a: [-26.08861, 28.04583], p: "Sandton" },
  { n: "Sandton", c: "c", a: [-26.10458, 28.05453] },
  { n: "Inanda", c: "s", a: [-26.11862, 28.05917], p: "Sandton" },
  { n: "Parkmore", c: "s", a: [-26.09528, 28.0375], p: "Sandton" },
  { n: "Sandhurst", c: "s", a: [-26.10778, 28.04417], p: "Sandton" },
  { n: "Randburg", c: "c", a: [-26.09155, 28.002] },
  { n: "Hyde Park", c: "s", a: [-26.11972, 28.03973], p: "Sandton" },
  { n: "Illovo", c: "s", a: [-26.12278, 28.05527], p: "Sandton" },
  { n: "Birnam Park", c: "s", a: [-26.12972, 28.06833], p: "Sandton" },
  { n: "Melrose North", c: "s", a: [-26.13416, 28.06417], p: "Rosebank" },
  { n: "Craighall Park", c: "s", a: [-26.12639, 28.02333], p: "Rosebank" },
  { n: "Dunkeld", c: "s", a: [-26.13583, 28.04111], p: "Rosebank" },
  { n: "Birdhaven", c: "s", a: [-26.13944, 28.05611], p: "Rosebank" },
  { n: "Melrose", c: "s", a: [-26.14, 28.04945], p: "Rosebank" },
  { n: "Parktown North", c: "s", a: [-26.13944, 28.03028], p: "Rosebank" },
  { n: "Parkhurst", c: "s", a: [-26.13972, 28.01889], p: "Rosebank" },
  { n: "Rosebank", c: "t", a: [-26.14296, 28.03977] },
  { n: "Abbotsford", c: "s", a: [-26.14318, 28.06844], p: "Rosebank" },
  { n: "Parkwood", c: "s", a: [-26.15083, 28.03028], p: "Rosebank" },
  { n: "Oaklands", c: "s", a: [-26.14805, 28.06805], p: "Rosebank" },
  { n: "Parkview", c: "s", a: [-26.16416, 28.02528], p: "Rosebank" },
  { n: "Saxonwold", c: "s", a: [-26.15834, 28.03945], p: "Rosebank" },
  { n: "Riviera", c: "s", a: [-26.16055, 28.05083], p: "Rosebank" },
  { n: "Killarney", c: "s", a: [-26.16675, 28.05047], p: "Rosebank" },
  { n: "Forest Town", c: "s", a: [-26.17278, 28.03667], p: "Rosebank" },
  { n: "Bellevue", c: "s", a: [-26.17722, 28.07], p: "Johannesburg" },
  { n: "Yeoville", c: "s", a: [-26.18389, 28.06417], p: "Johannesburg" },
  { n: "Berea", c: "s", a: [-26.18223, 28.05333], p: "Johannesburg" },
  { n: "Bertrams", c: "s", a: [-26.19111, 28.06555], p: "Johannesburg" },
  { n: "Hillbrow", c: "s", a: [-26.18805, 28.04833], p: "Johannesburg" },
  { n: "Doornfontein", c: "s", a: [-26.19416, 28.05777], p: "Johannesburg" },
  { n: "Troyeville", c: "s", a: [-26.19902, 28.06556], p: "Johannesburg" },
  { n: "Alberton", c: "t", a: [-26.26702, 28.12208] },
  { n: "Johannesburg", c: "c", a: [-26.20497, 28.04973] },
  { n: "Marshalltown", c: "s", a: [-26.20747, 28.04244], p: "Johannesburg" },
  { n: "Braamfontein", c: "s", a: [-26.1923, 28.03613], p: "Johannesburg" },
  { n: "Newtown", c: "s", a: [-26.2039, 28.03428], p: "Johannesburg" },
  { n: "Ferreirasdorp", c: "s", a: [-26.20366, 28.03354], p: "Johannesburg" },
  { n: "Parktown", c: "s", a: [-26.18167, 28.02778], p: "Johannesburg" },
  { n: "Cottesloe", c: "s", a: [-26.18636, 28.01857], p: "Johannesburg" },
  { n: "Richmond", c: "s", a: [-26.18167, 28.01611], p: "Johannesburg" },
  { n: "Vrededorp", c: "s", a: [-26.19416, 28.01861], p: "Johannesburg" },
  { n: "Fordsburg", c: "s", a: [-26.20555, 28.02222], p: "Johannesburg" },
  { n: "Ophirton", c: "s", a: [-26.22305, 28.02889], p: "Johannesburg" },
  { n: "Mayfair", c: "s", a: [-26.205, 28.01417], p: "Johannesburg" },
  { n: "Crown", c: "s", a: [-26.21886, 28.00858], p: "Johannesburg" },
  { n: "Homestead Park", c: "s", a: [-26.20145, 27.99866], p: "Johannesburg" },
  { n: "Brixton", c: "s", a: [-26.19139, 27.99666], p: "Johannesburg" },
  { n: "Rossmore", c: "s", a: [-26.18639, 27.99666], p: "Johannesburg" },
  { n: "Mayfair West", c: "s", a: [-26.19695, 27.99639], p: "Johannesburg" },
  { n: "Langlaagte North", c: "s", a: [-26.19944, 27.99666], p: "Johannesburg" },
  { n: "Hursthill", c: "s", a: [-26.18722, 27.98556], p: "Johannesburg" },
  { n: "Crosby", c: "s", a: [-26.19278, 27.98388], p: "Johannesburg" },
  { n: "Coronationville", c: "s", a: [-26.19, 27.97694], p: "Johannesburg" },
  { n: "Paarlshoop", c: "s", a: [-26.20705, 27.98942], p: "Johannesburg" },
  { n: "Booysens Reserve", c: "s", a: [-26.23084, 28.01222], p: "Johannesburg" },
  { n: "Theta", c: "s", a: [-26.23389, 27.99944], p: "Johannesburg" },
  { n: "Riverlea", c: "s", a: [-26.21168, 27.97403], p: "Johannesburg" },
  { n: "Bosmont", c: "s", a: [-26.18833, 27.9547], p: "Soweto" },
  { n: "Roodepoort", c: "c", a: [-26.15667, 27.88553] },
  { n: "Noordgesig", c: "s", a: [-26.22889, 27.93944], p: "Soweto" },
  { n: "Orlando West", c: "s", a: [-26.22056, 27.91473], p: "Soweto" },
  { n: "Orlando", c: "s", a: [-26.22254, 27.91175], p: "Soweto" },
  { n: "Orlando East", c: "s", a: [-26.2379, 27.92791], p: "Soweto" },
  { n: "Meadowlands East", c: "s", a: [-26.22078, 27.89945], p: "Soweto" },
  { n: "Soweto", c: "c", a: [-26.22275, 27.89] },
  { n: "Orlando Ekhaya", c: "s", a: [-26.25, 27.93333], p: "Soweto" },
  { n: "Power Park", c: "s", a: [-26.26445, 27.92555], p: "Soweto" },
  { n: "Klipspruit", c: "s", a: [-26.25416, 27.91027], p: "Soweto" },
  { n: "Dube", c: "s", a: [-26.23861, 27.89277], p: "Soweto" },
  { n: "Mofolo South", c: "s", a: [-26.25306, 27.88916], p: "Soweto" },
  { n: "Pimville", c: "s", a: [-26.27115, 27.90585], p: "Soweto" },
  { n: "Moroka", c: "s", a: [-26.26111, 27.875], p: "Soweto" },
  { n: "Dlamini", c: "s", a: [-26.27278, 27.87889], p: "Soweto" },
  { n: "Eldoradopark", c: "s", a: [-26.295, 27.90277], p: "Soweto" },
  { n: "Klipspruit-Wes", c: "s", a: [-26.29, 27.87805], p: "Lenasia" },
  { n: "Senaoane", c: "s", a: [-26.27583, 27.8625], p: "Lenasia" },
  { n: "Tshiawelo", c: "s", a: [-26.28278, 27.86417], p: "Lenasia" },
  { n: "Klipriviersoog", c: "s", a: [-26.29, 27.85194], p: "Lenasia" },
  { n: "Protea South", c: "s", a: [-26.28528, 27.84139], p: "Lenasia" },
  { n: "Tshepisong", c: "t", a: [-26.1901, 27.80339] },
  { n: "Ennerdale", c: "t", a: [-26.41493, 27.84631] },
  { n: "Lenasia", c: "t", a: [-26.3195, 27.82468] },
  { n: "Simunye", c: "s", a: [-26.32395, 27.694], p: "Lenasia" },
  { n: "Westonaria", c: "s", a: [-26.31778, 27.65194], p: "Lenasia" },
  { n: "Blybank", c: "s", a: [-26.33806, 27.47528], p: "Carletonville" },
  { n: "Carletonville", c: "t", a: [-26.36142, 27.40188] },
  { n: "Oberholzer", c: "s", a: [-26.35005, 27.38414], p: "Carletonville" },
  { n: "Welverdiend", c: "s", a: [-26.38667, 27.27722], p: "Carletonville" },
  { n: "Boskop", c: "v", a: [-26.56527, 27.12833] },
  { n: "Cachet", c: "s", a: [-26.68725, 27.09578], p: "Potchefstroom" },
  { n: "Dassierand", c: "s", a: [-26.69361, 27.075], p: "Potchefstroom" },
  { n: "Potchefstroom", c: "c", a: [-26.70774, 27.0958] },
  { n: "Potchindustria", c: "s", a: [-26.72166, 27.07278], p: "Potchefstroom" },
  { n: "Ikageng", c: "s", a: [-26.71694, 27.055], p: "Potchefstroom" },
  { n: "Khuma", c: "t", a: [-26.85072, 26.86707] },
  { n: "Stilfontein", c: "t", a: [-26.84299, 26.78321] },
  { n: "Adamayview", c: "s", a: [-26.84916, 26.68444], p: "Klerksdorp" },
  { n: "Dawkinsville", c: "s", a: [-26.86695, 26.68167], p: "Klerksdorp" },
  { n: "Irenepark", c: "s", a: [-26.85525, 26.67247], p: "Klerksdorp" },
  { n: "Flamwood", c: "s", a: [-26.8525, 26.66861], p: "Klerksdorp" },
  { n: "Pienaarsdorp", c: "s", a: [-26.86389, 26.67225], p: "Klerksdorp" },
  { n: "Elandsheuwel", c: "s", a: [-26.85058, 26.65669], p: "Klerksdorp" },
  { n: "Klerksdorp", c: "c", a: [-26.86251, 26.66571] },
  { n: "Elandia", c: "s", a: [-26.85778, 26.65778], p: "Klerksdorp" },
  { n: "Nuwedorp", c: "s", a: [-26.86653, 26.66599], p: "Klerksdorp" },
  { n: "Roosheuwel", c: "s", a: [-26.87611, 26.64806], p: "Klerksdorp" },
  { n: "Oudorp", c: "s", a: [-26.88167, 26.64666], p: "Klerksdorp" },
  { n: "Neserhof", c: "s", a: [-26.89111, 26.65362], p: "Klerksdorp" },
  { n: "Campbell", c: "s", a: [-26.89333, 26.65528], p: "Klerksdorp" },
  { n: "Boetrand", c: "s", a: [-26.89695, 26.68111], p: "Klerksdorp" },
  { n: "Uitkomsdal", c: "s", a: [-26.91556, 26.66139], p: "Klerksdorp" },
  { n: "Nooitgedacht", c: "s", a: [-26.92416, 26.67778], p: "Orkney" },
  { n: "Orkney", c: "t", a: [-26.97524, 26.67189] },
  { n: "Lourenspark", c: "s", a: [-26.98778, 26.66166], p: "Orkney" },
  { n: "Leeudoringstad", c: "t", a: [-27.2325, 26.22608] },
  { n: "Wolmaransstad", c: "t", a: [-27.20044, 25.97992] },
  { n: "Makwassie", c: "t", a: [-27.31421, 25.99494] },
  { n: "Boskuil", c: "v", a: [-27.41437, 25.8783] },
  { n: "Bloemhof", c: "t", a: [-27.64613, 25.60664] },
  { n: "Christiana", c: "t", a: [-27.91366, 25.16461] },
  { n: "Warrenton", c: "t", a: [-28.11135, 24.8497] },
  { n: "Kenilworth", c: "s", a: [-28.70808, 24.78585], p: "Kimberley" },
  { n: "Ashburnham", c: "s", a: [-28.71535, 24.77084], p: "Kimberley" },
  { n: "Homestead", c: "s", a: [-28.70569, 24.74535], p: "Kimberley" },
  { n: "Colville", c: "s", a: [-28.71376, 24.7565], p: "Kimberley" },
  { n: "Floors", c: "s", a: [-28.7181, 24.7652], p: "Kimberley" },
  { n: "Galeshewe", c: "s", a: [-28.72365, 24.7474], p: "Kimberley" },
  { n: "Mint Village", c: "s", a: [-28.71957, 24.77222], p: "Kimberley" },
  { n: "Squarehill Park", c: "s", a: [-28.72449, 24.75924], p: "Kimberley" },
  { n: "Moghul Park", c: "s", a: [-28.7215, 24.77521], p: "Kimberley" },
  { n: "Gemdene", c: "s", a: [-28.72715, 24.75444], p: "Kimberley" },
  { n: "Kimberley North", c: "s", a: [-28.73205, 24.76655], p: "Kimberley" },
  { n: "De Beers", c: "s", a: [-28.73351, 24.77425], p: "Kimberley" },
  { n: "West End", c: "s", a: [-28.73841, 24.74958], p: "Kimberley" },
  { n: "Kimberley", c: "c", a: [-28.73831, 24.76421] },
  { n: "Albertynshof", c: "s", a: [-28.74566, 24.75579], p: "Kimberley" },
  { n: "New Park", c: "s", a: [-28.74843, 24.76045], p: "Kimberley" },
  { n: "Kestellhof", c: "s", a: [-28.74833, 24.7525], p: "Kimberley" },
  { n: "Labram", c: "s", a: [-28.75198, 24.76352], p: "Kimberley" },
  { n: "Belgravia", c: "s", a: [-28.74577, 24.77785], p: "Kimberley" },
  { n: "Ernestville", c: "s", a: [-28.74316, 24.78365], p: "Kimberley" },
  { n: "Herlear", c: "s", a: [-28.74973, 24.78303], p: "Kimberley" },
  { n: "Cassandra", c: "s", a: [-28.74338, 24.79416], p: "Kimberley" },
  { n: "Beaconsfield", c: "s", a: [-28.75154, 24.78841], p: "Kimberley" },
  { n: "Greenside", c: "s", a: [-28.7573, 24.79108], p: "Kimberley" },
  { n: "Klisserville", c: "s", a: [-28.75798, 24.77234], p: "Kimberley" },
  { n: "Monument Heights", c: "s", a: [-28.76138, 24.76416], p: "Kimberley" },
  { n: "Greenpoint", c: "s", a: [-28.77496, 24.76899], p: "Kimberley" },
  { n: "Southridge", c: "s", a: [-28.77094, 24.76108], p: "Kimberley" },
  { n: "Royldene", c: "s", a: [-28.7605, 24.75476], p: "Kimberley" },
  { n: "El Torro Park", c: "s", a: [-28.7627, 24.74107], p: "Kimberley" },
  { n: "Ronald's Vlei", c: "s", a: [-28.78777, 24.75722], p: "Kimberley" },
  { n: "Ritchie", c: "v", a: [-29.0275, 24.60002] },
  { n: "Hopetown", c: "t", a: [-29.62398, 24.08298] },
  { n: "De Aar", c: "t", a: [-30.65054, 24.00753] },
  { n: "Victoria West", c: "t", a: [-31.40303, 23.12056] },
  { n: "Beaufort West", c: "t", a: [-32.35365, 22.5806] },
  { n: "Leeu-Gamka", c: "v", a: [-32.77558, 21.97678] },
  { n: "Laingsburg", c: "t", a: [-33.19503, 20.85917] },
  { n: "Matjiesfontein", c: "t", a: [-33.23194, 20.58031] },
  { n: "Touws River", c: "t", a: [-33.33777, 20.03357] },
  { n: "De Doorns", c: "t", a: [-33.47942, 19.67085] },
  { n: "De Wet", c: "s", a: [-33.60557, 19.51179], p: "Worcester" },
  { n: "Meiringspark", c: "s", a: [-33.62698, 19.47791], p: "Worcester" },
  { n: "Industria", c: "s", a: [-33.63833, 19.46389], p: "Worcester" },
  { n: "Roodewal", c: "s", a: [-33.64973, 19.46639], p: "Worcester" },
  { n: "Panorama", c: "s", a: [-33.6174, 19.45413], p: "Worcester" },
  { n: "Fairway Heights", c: "s", a: [-33.61667, 19.44583], p: "Worcester" },
  { n: "Reunion Park", c: "s", a: [-33.63153, 19.45125], p: "Worcester" },
  { n: "Esselen Park", c: "s", a: [-33.65193, 19.45571], p: "Worcester" },
  { n: "Parkersdam", c: "s", a: [-33.65278, 19.45555], p: "Worcester" },
  { n: "Paglande", c: "s", a: [-33.64195, 19.45027], p: "Worcester" },
  { n: "Florian Park", c: "s", a: [-33.65598, 19.45522], p: "Worcester" },
  { n: "Fairyglen", c: "s", a: [-33.63389, 19.44611], p: "Worcester" },
  { n: "Bergsig", c: "s", a: [-33.63527, 19.44445], p: "Worcester" },
  { n: "Worcester", c: "t", a: [-33.64621, 19.44589] },
  { n: "Victoria Park", c: "s", a: [-33.65472, 19.44389], p: "Worcester" },
  { n: "Worcester Wes", c: "s", a: [-33.63962, 19.44105], p: "Worcester" },
  { n: "Hospitaalpark", c: "s", a: [-33.63706, 19.43567], p: "Worcester" },
  { n: "Hospital Hill", c: "s", a: [-33.63833, 19.43417], p: "Worcester" },
  { n: "Langerug", c: "s", a: [-33.64369, 19.43018], p: "Worcester" },
  { n: "Somerset Park", c: "s", a: [-33.63833, 19.42639], p: "Worcester" },
  { n: "Rawsonville", c: "t", a: [-33.68471, 19.31517] },
  { n: "Goudini", c: "t", a: [-33.66664, 19.25835] },
  { n: "Botha", c: "t", a: [-33.56385, 19.25835] },
  { n: "Breerivier", c: "s", a: [-33.53056, 19.20833], p: "Botha" },
  { n: "Montana", c: "s", a: [-33.42305, 19.20556], p: "Ceres" },
  { n: "Wolseley", c: "v", a: [-33.41303, 19.2017] },
  { n: "Ceres", c: "t", a: [-33.36831, 19.30916] },
  { n: "Tulbagh", c: "t", a: [-33.28505, 19.14067] },
  { n: "Tulbaghweg", c: "s", a: [-33.32188, 19.1008], p: "Tulbagh" },
  { n: "Ons Rust", c: "s", a: [-33.29334, 19.04528], p: "Tulbagh" },
  { n: "Hermon", c: "t", a: [-33.43696, 18.96807] },
  { n: "Wellington", c: "t", a: [-33.64306, 19.01055] },
  { n: "Langham", c: "s", a: [-33.64083, 18.9961], p: "Wellington" },
  { n: "Protea", c: "s", a: [-33.65416, 18.99528], p: "Wellington" },
  { n: "Hillcrest", c: "s", a: [-33.66, 18.99528], p: "Wellington" },
  { n: "Newton-Wes", c: "s", a: [-33.67027, 18.99528], p: "Wellington" },
  { n: "Newton", c: "s", a: [-33.67222, 19.00388], p: "Wellington" },
  { n: "Hillside", c: "s", a: [-33.69752, 19.00683], p: "Paarl" },
  { n: "Smartietown", c: "s", a: [-33.69798, 19.00151], p: "Paarl" },
  { n: "Spookietown", c: "s", a: [-33.6984, 19.00477], p: "Paarl" },
  { n: "Milky Town", c: "s", a: [-33.70143, 19.00579], p: "Paarl" },
  { n: "Groenheuwel", c: "s", a: [-33.69854, 18.99801], p: "Paarl" },
  { n: "Lonwabo", c: "s", a: [-33.70112, 19.00161], p: "Paarl" },
  { n: "Siyahlala 1", c: "s", a: [-33.70255, 19.00174], p: "Paarl" },
  { n: "Dalvale", c: "s", a: [-33.70063, 18.99202], p: "Paarl" },
  { n: "Fairyland", c: "s", a: [-33.7027, 18.99927], p: "Paarl" },
  { n: "Allandale", c: "s", a: [-33.70666, 18.99554], p: "Paarl" },
  { n: "Noorder-Paarl", c: "s", a: [-33.70671, 18.96497], p: "Paarl" },
  { n: "Dal Josafat", c: "s", a: [-33.70972, 18.97916], p: "Paarl" },
  { n: "Chicago", c: "s", a: [-33.71745, 18.99632], p: "Paarl" },
  { n: "New Orleans", c: "s", a: [-33.71553, 18.98695], p: "Paarl" },
  { n: "Charleston Hill", c: "s", a: [-33.72305, 18.9886], p: "Paarl" },
  { n: "Rabiesdale", c: "s", a: [-33.72889, 18.98972], p: "Paarl" },
  { n: "Huguenot", c: "s", a: [-33.72861, 18.98027], p: "Paarl" },
  { n: "Bloomsbury", c: "s", a: [-33.73361, 18.995], p: "Paarl" },
  { n: "Paarl", c: "c", a: [-33.73105, 18.9642] },
  { n: "Denneburg", c: "s", a: [-33.73499, 18.98388], p: "Paarl" },
  { n: "Klein Parys", c: "s", a: [-33.74167, 18.99472], p: "Paarl" },
  { n: "Vrykyk", c: "s", a: [-33.75277, 18.96556], p: "Paarl" },
  { n: "Suider-Paarl", c: "s", a: [-33.77084, 18.96666], p: "Paarl" },
  { n: "Courtrai", c: "s", a: [-33.77167, 18.95612], p: "Paarl" },
  { n: "De Zoete Inval", c: "s", a: [-33.77583, 18.96028], p: "Paarl" },
  { n: "Simondium", c: "v", a: [-33.83806, 18.96111] },
  { n: "Klapmuts", c: "v", a: [-33.8054, 18.86971] },
  { n: "Elsenburg", c: "s", a: [-33.845, 18.84083], p: "Stellenbosch" },
  { n: "Stellenbosch", c: "t", a: [-33.93446, 18.86919] },
  { n: "De Novo", c: "s", a: [-33.84084, 18.77528], p: "Kraaifontein" },
  { n: "Kraaifontein East", c: "s", a: [-33.84309, 18.73965], p: "Kraaifontein" },
  { n: "Joostenbergvlakte", c: "s", a: [-33.82861, 18.73272], p: "Kraaifontein" },
  { n: "Bloekombos", c: "s", a: [-33.84166, 18.73333], p: "Kraaifontein" },
  { n: "Belmont Park", c: "s", a: [-33.84472, 18.73333], p: "Kraaifontein" },
  { n: "Wallacedene", c: "s", a: [-33.85, 18.73333], p: "Kraaifontein" },
  { n: "Viking Village", c: "s", a: [-33.83049, 18.71889], p: "Kraaifontein" },
  { n: "Eikendal", c: "s", a: [-33.85, 18.72889], p: "Kraaifontein" },
  { n: "Peerless Park", c: "s", a: [-33.84312, 18.7235], p: "Kraaifontein" },
  { n: "Kraaifontein", c: "t", a: [-33.84775, 18.71607] },
  { n: "Scottsdene", c: "s", a: [-33.86278, 18.72499], p: "Kraaifontein" },
  { n: "Windsor Park", c: "s", a: [-33.84805, 18.70445], p: "Kraaifontein" },
  { n: "Scottsville", c: "s", a: [-33.85556, 18.70555], p: "Kraaifontein" },
  { n: "Northpine", c: "s", a: [-33.86944, 18.71473], p: "Kraaifontein" },
  { n: "De Tuin", c: "s", a: [-33.85834, 18.69167], p: "Kraaifontein" },
  { n: "Morgenster Hoogte", c: "s", a: [-33.86399, 18.69432], p: "Kraaifontein" },
  { n: "Vredekloof East", c: "s", a: [-33.86076, 18.6872], p: "Kraaifontein" },
  { n: "Morgenster", c: "s", a: [-33.86917, 18.6925], p: "Kraaifontein" },
  { n: "Arauna", c: "s", a: [-33.86933, 18.6865], p: "Kraaifontein" },
  { n: "Vredekloof", c: "s", a: [-33.86194, 18.67833], p: "Durbanville" },
  { n: "Brackenfell", c: "s", a: [-33.88306, 18.7], p: "Kraaifontein" },
  { n: "Eden Park", c: "s", a: [-33.87079, 18.67923], p: "Kraaifontein" },
  { n: "Bracken Heights", c: "s", a: [-33.87417, 18.67889], p: "Kraaifontein" },
  { n: "Durbanville", c: "t", a: [-33.84027, 18.64946] },
  { n: "East Rock", c: "s", a: [-33.87061, 18.66432], p: "Durbanville" },
  { n: "Glen Ive", c: "s", a: [-33.87222, 18.66194], p: "Durbanville" },
  { n: "Vredenberg", c: "s", a: [-33.87694, 18.66694], p: "Durbanville" },
  { n: "Oakglen", c: "s", a: [-33.88587, 18.66768], p: "Kuilsrivier" },
  { n: "Stikland", c: "s", a: [-33.89222, 18.66916], p: "Kuilsrivier" },
  { n: "Stellenridge", c: "s", a: [-33.875, 18.65834], p: "Durbanville" },
  { n: "Bellair", c: "s", a: [-33.88583, 18.6625], p: "Kuilsrivier" },
  { n: "Soneike", c: "s", a: [-33.91639, 18.68111], p: "Kuilsrivier" },
  { n: "La Rochelle", c: "s", a: [-33.88084, 18.65638], p: "Durbanville" },
  { n: "Kuilsrivier", c: "t", a: [-33.92691, 18.6856] },
  { n: "Blomtuin", c: "s", a: [-33.88333, 18.65056], p: "Durbanville" },
  { n: "Shirley Park", c: "s", a: [-33.90556, 18.66334], p: "Kuilsrivier" },
  { n: "Mabille Park", c: "s", a: [-33.91834, 18.67084], p: "Kuilsrivier" },
  { n: "Eersterivier", c: "t", a: [-34.00002, 18.72165] },
  { n: "Labiance", c: "s", a: [-33.91194, 18.65916], p: "Kuilsrivier" },
  { n: "Voelvlei", c: "s", a: [-33.92306, 18.66722], p: "Kuilsrivier" },
  { n: "Blue Downs", c: "t", a: [-34.00002, 18.69753] },
  { n: "Glenhaven", c: "s", a: [-33.91973, 18.65806], p: "Kuilsrivier" },
  { n: "Chrismar", c: "s", a: [-33.89222, 18.64694], p: "Kuilsrivier" },
  { n: "Bellville South", c: "s", a: [-33.91611, 18.64444], p: "Kuilsrivier" },
  { n: "Oakdale", c: "s", a: [-33.89139, 18.63639], p: "Parow" },
  { n: "Hoheizen", c: "s", a: [-33.88306, 18.62083], p: "Parow" },
  { n: "Boston", c: "s", a: [-33.89139, 18.61944], p: "Parow" },
  { n: "Loevenstein", c: "s", a: [-33.88556, 18.60639], p: "Parow" },
  { n: "Ravensmead", c: "s", a: [-33.92111, 18.60639], p: "Elsiesriver" },
  { n: "Parow-Oos", c: "s", a: [-33.89695, 18.59833], p: "Parow" },
  { n: "Parowvallei", c: "s", a: [-33.91222, 18.59277], p: "Parow" },
  { n: "Cravenby", c: "s", a: [-33.92472, 18.59167], p: "Elsiesriver" },
  { n: "Parow North", c: "s", a: [-33.89039, 18.58593], p: "Parow" },
  { n: "Parow", c: "t", a: [-33.90248, 18.58698] },
  { n: "Elsiesriver", c: "t", a: [-33.93083, 18.58638] },
  { n: "Beaconvale", c: "s", a: [-33.91651, 18.58408], p: "Parow" },
  { n: "Norwood", c: "s", a: [-33.92583, 18.57805], p: "Elsiesriver" },
  { n: "Vrijzee", c: "s", a: [-33.9075, 18.56973], p: "Parow" },
  { n: "Vasco", c: "s", a: [-33.90472, 18.56139], p: "Parow" },
  { n: "Goodwood", c: "s", a: [-33.90666, 18.54917], p: "Parow" },
  { n: "Epping Industria 2", c: "s", a: [-33.93417, 18.55444], p: "Elsiesriver" },
  { n: "Thornton", c: "s", a: [-33.92361, 18.53528], p: "Elsiesriver" },
  { n: "Epping Industria 1", c: "s", a: [-33.93337, 18.53458], p: "Elsiesriver" },
  { n: "Wingfield", c: "s", a: [-33.9075, 18.52925], p: "Milnerton" },
  { n: "Windermere", c: "s", a: [-33.91222, 18.52084], p: "Milnerton" },
  { n: "Pinelands", c: "s", a: [-33.93166, 18.51278], p: "Milnerton" },
  { n: "Kensington", c: "s", a: [-33.91445, 18.50694], p: "Milnerton" },
  { n: "Milnerton", c: "t", a: [-33.87947, 18.49643] },
  { n: "Maitland", c: "s", a: [-33.9225, 18.49306], p: "Milnerton" },
  { n: "Ndabeni", c: "s", a: [-33.92849, 18.49162], p: "Milnerton" },
  { n: "Maitland Garden Village", c: "s", a: [-33.93528, 18.48889], p: "Milnerton" },
  { n: "Brooklyn", c: "s", a: [-33.90889, 18.47916], p: "Milnerton" },
  { n: "Paarden Eiland", c: "s", a: [-33.91405, 18.47119], p: "Milnerton" },
  { n: "Mowbray", c: "s", a: [-33.94834, 18.47417], p: "Cape Town" },
  { n: "Observatory", c: "s", a: [-33.93694, 18.46833], p: "Cape Town" },
  { n: "Salt River", c: "s", a: [-33.9317, 18.461], p: "Cape Town" },
  { n: "Woodstock", c: "s", a: [-33.93056, 18.44723], p: "Cape Town" },
  { n: "Foreshore", c: "s", a: [-33.92296, 18.43825], p: "Cape Town" },
  { n: "District Six", c: "s", a: [-33.93255, 18.43505], p: "Cape Town" },
  { n: "Vredehoek", c: "s", a: [-33.94056, 18.42305], p: "Cape Town" },
  { n: "Oranjezicht", c: "s", a: [-33.94389, 18.415], p: "Cape Town" },
  { n: "Cape Town", c: "c", a: [-33.92883, 18.41721] },
  { n: "Waterfront", c: "s", a: [-33.90306, 18.42167], p: "Cape Town" },
  { n: "City Centre", c: "s", a: [-33.92439, 18.42006], p: "Cape Town" },
  { n: "Gardens", c: "s", a: [-33.93278, 18.40972], p: "Cape Town" },
  { n: "Tamboerskloof", c: "s", a: [-33.92833, 18.40639], p: "Cape Town" },
  { n: "Bo-Kaap", c: "s", a: [-33.91989, 18.41215], p: "Cape Town" },
];

const KIND_WORD: Record<PlaceKind, string> = {
  c: "city",
  t: "town",
  v: "village",
  s: "suburb",
};

/**
 * How close the train has to pass for a place to be included at all, by kind.
 * A city is worth naming from ten kilometres out; a suburb two streets wide is
 * not, unless the line actually runs through it.
 */
const MAX_OFFSET_KM: Record<PlaceKind, number> = { c: 12, t: 9, v: 7, s: 3 };

const NOTES: Record<string, string> = {
  "Pretoria":
    "Laid out in 1855 and named for Andries Pretorius. The administrative capital, and the seventy thousand jacarandas planted from the 1890s that turn it purple every October.",
  "Salvokop":
    "The railway's own hill. Built for staff of the Netherlands-South African Railway Company in the 1890s; Freedom Park now stands on the ridge above it.",
  "Pretoria Central":
    "The 1910 station below Church Square is Herbert Baker's - the same architect as the Union Buildings on the hill opposite.",
  "Sunnyside":
    "Pretoria's oldest suburb outside the centre, and for most of the last century its densest.",
  "Muckleneuk":
    "The ridge suburb above the city, laid out around the turn of the twentieth century.",
  "Centurion":
    "Grew out of Lyttelton, a British garrison camp of the South African War. Called Verwoerdburg from 1967 until the name was dropped in 1995.",
  "Lyttelton Manor":
    "Named for the British war camp that stood here in 1900.",
  "Irene":
    "A village built around the Irene Estate dairy from 1902. Jan Smuts lived at Doornkloof beside it for forty years; the house is a museum.",
  "Midrand":
    "Named for exactly where it is - halfway down the reef between Pretoria and Johannesburg.",
  "Halfway House":
    "The original name: a coaching stop midway between the two towns, long before Midrand grew around it.",
  "Thembisa":
    "Established in 1957 when black residents were removed from Alexandra and the surrounding farms. One of Gauteng's largest townships.",
  "Kempton Park":
    "Laid out in 1903 by a German settler who named it for Kempten in Bavaria. OR Tambo airport lies just east of it.",
  "Diepsloot":
    "A settlement of the early 1990s, on the far northern edge of the city.",
  "Alexandra":
    "Proclaimed in 1912 as one of the few places black South Africans could own freehold land, and never removed - it survives surrounded by Sandton.",
  "Marlboro":
    "Where the Gautrain surfaces from its tunnel, on the edge of Alexandra.",
  "Sandton":
    "A suburb until the 1970s. The JSE moved here from downtown Johannesburg in 2000, and the towers followed.",
  "Sandown":
    "Built around the Sandton City centre that opened in 1973 and pulled the business district north.",
  "Randburg":
    "Formed in 1959 out of a cluster of smallholdings north-west of the city.",
  "Rosebank":
    "An Edwardian suburb that the Gautrain turned into an office district.",
  "Illovo":
    "Named for the sugar estate in Natal; laid out between the wars.",
  "Saxonwold":
    "Laid out in 1892 around a plantation of Saxon oaks. The zoo and the war museum are here.",
  "Parktown":
    "Johannesburg's first grand suburb, built on the ridge in the 1890s by the Randlords, away from the dust of the mines.",
  "Killarney":
    "Home of the country's first purpose-built film studio, and later its first shopping mall, in 1958.",
  "Hillbrow":
    "High-rise from the 1960s, and one of the few places that ignored the Group Areas Act in practice. The tower above it was Africa's tallest when it opened in 1971.",
  "Berea":
    "A ridge suburb of the 1890s, above and just east of the city centre.",
  "Yeoville":
    "Laid out in 1890 on the ridge; Rockey Street was the city's nightlife in the 1980s and nineties.",
  "Doornfontein":
    "One of the first suburbs, and the site of the Rand Rebellion's fiercest fighting in 1922.",
  "Troyeville":
    "An 1890s working-class suburb east of the centre, on the ridge above the old Wanderers ground.",
  "Bertrams":
    "Laid out in 1889; Ellis Park stadium sits at its western edge.",
  "Johannesburg":
    "Founded in 1886 on the gold reef and named within weeks. Park Station, rebuilt in the 1930s and again in 1965, is the largest railway station in Africa.",
  "Braamfontein":
    "The railway suburb. The marshalling yards, the loco sheds and Wits University are all here, and the line to the Cape starts from its west end.",
  "Marshalltown":
    "The financial district from the 1890s until the JSE left for Sandton in 2000.",
  "Ferreirasdorp":
    "The oldest part of the city - Ferreira's Camp, the diggers' tent town of 1886.",
  "Newtown":
    "Burned and cleared in 1904 after a plague scare, rebuilt as the produce market, and now the museum and theatre quarter.",
  "Fordsburg":
    "An early mining suburb, the headquarters of the 1922 Rand Rebellion, and since the 1970s the city's Indian commercial centre.",
  "Vrededorp":
    "Laid out in 1893 for poor Afrikaner families, on land granted by Paul Kruger.",
  "Mayfair":
    "An 1890s railway suburb beside the Braamfontein yards.",
  "Brixton":
    "The ridge suburb above the western reef, with the 1961 broadcast tower on top.",
  "Langlaagte North":
    "Langlaagte is where George Harrison found the Main Reef outcrop in 1886 - the discovery that made Johannesburg.",
  "Crown":
    "Crown Mines worked the reef directly under here; the mine dumps beside the line are its tailings.",
  "Riverlea":
    "Built in the 1960s for coloured families removed from Sophiatown, Vrededorp and Newclare.",
  "Coronationville":
    "Laid out in 1937 for the coronation of George VI, and one of the first coloured townships on the Rand.",
  "Roodepoort":
    "A gold town of 1887 in its own right, absorbed into greater Johannesburg.",
  "Noordgesig":
    "Built in 1939 for coloured families, on the edge of what would become Soweto.",
  "Soweto":
    "South Western Townships - an acronym adopted in 1963 for a group of settlements begun in the 1930s. More than a million people.",
  "Orlando":
    "The oldest part of Soweto, laid out in 1931 and named for the Johannesburg councillor Edwin Orlando Leake. The two cooling towers are its landmark.",
  "Orlando West":
    "Where the schoolchildren's march began on 16 June 1976. Vilakazi Street runs through it.",
  "Orlando East":
    "The original 1931 township, east of the Klipspruit stream.",
  "Meadowlands East":
    "Built in 1955 to receive families removed from Sophiatown.",
  "Dube":
    "Named for John Langalibalele Dube, first president of the ANC. Laid out in 1948 as Soweto's first home-ownership township.",
  "Pimville":
    "The oldest surviving township on the Rand, moved here in 1934 from the Klipspruit sewage farm where it began in 1904.",
  "Klipspruit":
    "Where Johannesburg's first township was established in 1904, on the municipal sewage farm.",
  "Moroka":
    "An emergency camp of 1946, named for the Bloemfontein doctor and ANC president James Moroka.",
  "Eldoradopark":
    "Laid out in the 1960s for coloured families removed from the inner city.",
  "Lenasia":
    "Established in the 1950s as the Indian township for the Witwatersrand, thirty kilometres from the city it served.",
  "Westonaria":
    "A gold town laid out in the 1930s around the Venterspost mine on the far West Rand.",
  "Carletonville":
    "Proclaimed in 1948 above the Far West Rand goldfield. The deepest workings on earth are beneath it - past four kilometres.",
  "Oberholzer":
    "The older settlement Carletonville grew around, and the name of the dolomitic compartment that gave the area its sinkholes.",
  "Welverdiend":
    "A railway village on the line west, named for the farm it stands on.",
  "Boskop":
    "A farming village on the Mooi River above Potchefstroom; the Boskop dam is just north.",
  "Potchefstroom":
    "Founded in 1838, the first capital of the Transvaal, and a university town since 1869. The Mooi River runs through it.",
  "Ikageng":
    "Potchefstroom's township, established in the 1950s. The name means 'build yourself'.",
  "Stilfontein":
    "A gold town proclaimed in 1949, built for the mines between Potchefstroom and Klerksdorp.",
  "Khuma":
    "The township serving the Stilfontein and Buffelsfontein mines.",
  "Klerksdorp":
    "The oldest European settlement north of the Vaal, laid out in 1837 - and gold country since 1885. Maize on the other side.",
  "Orkney":
    "A mining town named by a Scots prospector from the islands. The shafts here reach three kilometres.",
  "Leeudoringstad":
    "A maize-country siding on the line to Kimberley.",
  "Wolmaransstad":
    "Maize on one side, alluvial diamond diggings on the other, worked since the 1890s.",
  "Makwassie":
    "Named for the wild sage that grows here; one of the older settlements in the western Transvaal.",
  "Boskuil":
    "A siding in the maize country between Makwassie and Bloemhof.",
  "Bloemhof":
    "On the Vaal, beside the dam of the same name - one of the largest bodies of water in the interior, and a diamond-digging town before that.",
  "Christiana":
    "Founded in 1870 and named for a president's daughter. Alluvial diamonds have been worked out of the Vaal gravels here ever since.",
  "Warrenton":
    "Where the line to Kimberley crosses the Vaal. The bridge is the reason the town is here.",
  "Kimberley":
    "The Big Hole was dug by hand from 1871 and is the largest such excavation in the world. This railway was built to serve it and arrived in 1885; the town had electric street lighting before London.",
  "Galeshewe":
    "Kimberley's oldest township, named for the Batlhaping chief imprisoned on Robben Island in the 1870s.",
  "Beaconsfield":
    "A separate diamond town around the Dutoitspan and Bultfontein mines until it merged with Kimberley in 1912.",
  "Belgravia":
    "Where the diamond magnates built - Rhodes, Barnato and the Oppenheimers all had houses on these streets.",
  "De Beers":
    "Named for the brothers whose farm gave the mine, and the company, its name.",
  "Kenilworth":
    "A model village De Beers built for its white employees in the 1890s.",
  "Ritchie":
    "A small Karoo-edge town on the Riet River south of Kimberley.",
  "Hopetown":
    "The Eureka, the first diamond found in South Africa, was picked up beside the Orange near here in 1867. Everything that followed followed from that.",
  "De Aar":
    "The junction that ties the Cape to the interior, opened in 1884. For most of the twentieth century the busiest marshalling yard in the country.",
  "Victoria West":
    "A Karoo town of 1843, some way off the line that took its name.",
  "Beaufort West":
    "The oldest municipality in the country, proclaimed in 1837, and the capital of the Great Karoo. Christiaan Barnard grew up in the parsonage here.",
  "Leeu-Gamka":
    "A siding where the Leeu and Gamka rivers meet - lion in Afrikaans and in Khoe, the same word twice.",
  "Laingsburg":
    "On 25 January 1981 the Buffels River flooded and carried away most of the town. The line and the town were rebuilt; the flood marker is still up.",
  "Matjiesfontein":
    "James Logan, a railway refreshment contractor, built a spa village here in the 1880s for travellers with weak lungs. It survives almost whole - the hotel, the station and one street.",
  "Touws River":
    "A locomotive depot from 1877, where bank engines were coupled on for the climb up the Hex River pass. The sheds still stand.",
  "De Doorns":
    "The floor of the Hex River valley, and most of the table grapes South Africa exports.",
  "Worcester":
    "Founded in 1820 and the largest town in the Breede River valley - brandy, grapes, and the Karoo Desert botanical garden.",
  "Rawsonville":
    "A wine village of the 1850s on the Breede, named for a Cape colonial secretary.",
  "Wolseley":
    "A junction village at the foot of the Nuwekloof pass into the Tulbagh valley.",
  "Ceres":
    "Named for the Roman goddess of the harvest, and reached through Michell's Pass. Deciduous fruit and the country's fruit-juice industry.",
  "Tulbagh":
    "The 1743 village whose Church Street was flattened by an earthquake in 1969 and rebuilt exactly as it had been - the largest concentration of Cape Dutch buildings anywhere.",
  "Hermon":
    "A wheat-country siding on the Berg River, below Bain's Kloof.",
  "Wellington":
    "Founded in 1840 at the bottom of Bain's Kloof pass. Wheat, vines, and the dried-fruit trade.",
  "Paarl":
    "Named in 1657 for the granite domes above it, which glisten after rain. Nelson Mandela walked out of Victor Verster prison here on 11 February 1990.",
  "Huguenot":
    "Named for the French Huguenots who settled this valley from 1688 and planted the first vines.",
  "Dal Josafat":
    "The valley where the Genootskap van Regte Afrikaners was founded in 1875, and the first Afrikaans newspaper printed.",
  "Simondium":
    "Named for Pierre Simond, the Huguenot minister who arrived in 1688.",
  "Klapmuts":
    "A crossroads village between Paarl and Stellenbosch, on the Cape main line.",
  "Elsenburg":
    "An agricultural college since 1898, on a farm granted in 1698.",
  "Stellenbosch":
    "Founded in 1679, the second-oldest European settlement in the country, and a university town since 1918.",
  "Kraaifontein":
    "A railway junction village that grew into a northern suburb; the Malmesbury line branches here.",
  "Brackenfell":
    "Farmland until the 1960s, now solidly suburban.",
  "Durbanville":
    "Laid out in 1825 as Pampoenkraal and renamed for a governor. Wine farms on the hills above it.",
  "Kuilsrivier":
    "A halt on the wagon road to the interior from the 1660s - one of the oldest named places outside Cape Town.",
  "Bellville South":
    "Bellville began as Twelve Mile Post on the road inland, and took its name in 1861.",
  "Parow":
    "Named for a German sea captain who settled here in the 1880s, and the industrial heart of the northern suburbs.",
  "Goodwood":
    "Laid out in 1905 and named for the English racecourse; the Cape's own track was here.",
  "Elsiesriver":
    "A working-class suburb that absorbed thousands of families removed from the city under the Group Areas Act.",
  "Epping Industria 1":
    "Cape Town's first planned industrial township, laid out in the 1940s.",
  "Thornton":
    "A railway suburb, built for staff of the Salt River works.",
  "Pinelands":
    "South Africa's first garden city, laid out in 1919 on the model of Letchworth.",
  "Ndabeni":
    "The city's first segregated township, created in 1901 after a plague outbreak; cleared in the 1930s when its people were moved to Langa.",
  "Maitland":
    "A railway and industrial suburb from the 1880s, named for a Cape governor.",
  "Paarden Eiland":
    "The horse island - once a marshy spit at the Salt River mouth, now the industrial edge of the port.",
  "Milnerton":
    "Named for Lord Milner and laid out in 1897 as a seaside suburb reached by its own railway.",
  "Observatory":
    "Named for the Royal Observatory founded here in 1820, whose meridian defined the Cape's longitude.",
  "Salt River":
    "The railway works, opened in 1862, built and repaired the Cape's locomotives for a century, and the suburb grew around them.",
  "Woodstock":
    "The oldest suburb outside the centre, and one of the few not cleared under the Group Areas Act.",
  "District Six":
    "Home to sixty thousand people until it was declared white in 1966 and bulldozed. Most of the ground is still empty.",
  "Bo-Kaap":
    "Settled from the 1760s by freed slaves and their descendants, on the slope of Signal Hill. The painted houses are its own tradition.",
  "Foreshore":
    "All reclaimed. The shoreline ran along Strand Street until the 1940s; the station and everything seaward of it stands on fill.",
  "City Centre":
    "The Company's Garden was planted in 1652 to victual passing ships, and the city grew around it.",
  "Gardens":
    "Named for that same garden, which is still there, six blocks long.",
  "Cape Town":
    "The end of the line, under Table Mountain. The station stands on reclaimed ground, roughly where ships once anchored.",
  "Waterfront":
    "The Victoria and Alfred basins, built from 1860 after a winter of wrecks in Table Bay.",
  "Alberton":
    "Founded in 1904 on the farm Elandsfontein, south-east of the city.",
  "Ennerdale":
    "Laid out in the 1970s for coloured families, on the far southern edge of the Rand.",
  "Tshepisong":
    "A township of the 1990s on the western edge of Soweto.",
};

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  parent?: string;
  at: [number, number];
  km: number;
  offsetM: number;
  side: TrackSide;
  note: string;
  /** Somewhere the train stops, as opposed to somewhere it passes. */
  station: boolean;
}

const STATIONS = new Set([
  "Pretoria",
  "Johannesburg",
  "Kimberley",
  "De Aar",
  "Beaufort West",
  "Matjiesfontein",
  "Worcester",
  "Cape Town",
]);

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function describe(seed: Seed, offsetM: number, side: TrackSide): string {
  const written = NOTES[seed.n];
  if (written) return written;
  const where =
    offsetM < 400
      ? "right on the line"
      : `${(offsetM / 1000).toFixed(1)} km to the ${side === "ahead" ? "side" : side}`;
  return seed.p
    ? `A ${KIND_WORD[seed.c]} of ${seed.p}, ${where}.`
    : `A ${KIND_WORD[seed.c]} ${where}.`;
}

export const PLACES: Place[] = SEEDS.flatMap<Place>(seed => {
  const { offsetKm } = kmAtLatLon(seed.a);
  if (offsetKm > MAX_OFFSET_KM[seed.c]) return [];
  const reading = sideOfTrack(seed.a);
  return [
    {
      id: slug(seed.n),
      name: seed.n,
      kind: seed.c,
      parent: seed.p,
      at: seed.a,
      km: Math.round(reading.km * 10) / 10,
      offsetM: reading.offsetM,
      side: reading.side,
      note: describe(seed, reading.offsetM, reading.side),
      station: STATIONS.has(seed.n),
    },
  ];
}).sort((a, b) => a.km - b.km);

/**
 * How close the train has to be for a place to count as "passing now". A city
 * announces itself from further out than a suburb two streets wide.
 */
const PASSING_KM: Record<PlaceKind, number> = { c: 10, t: 7, v: 5, s: 2.5 };

/**
 * The place the train is passing right now. Where several overlap - and in the
 * middle of Johannesburg a dozen do - the one whose own scale makes it the
 * closest match wins, so a suburb beats the city it sits inside while the train
 * is in it, and the city takes over once the train is between suburbs.
 */
export function passingNow(trainKm: number): Place | null {
  let best: Place | null = null;
  let bestScore = Infinity;
  for (const place of PLACES) {
    const distance = Math.abs(place.km - trainKm);
    const range = PASSING_KM[place.kind];
    if (distance > range) continue;
    const score = distance / range;
    if (score < bestScore) {
      bestScore = score;
      best = place;
    }
  }
  return best;
}

/** The next place ahead that the train has not reached yet. */
export function nextPlace(trainKm: number): Place | null {
  return PLACES.find(place => place.km > trainKm + 0.8) ?? null;
}

/**
 * Places to label in the 3D view around a given distance, nearest first. Only a
 * handful are ever drawn at once - the markers are a pool, not one per place.
 */
export function placesNear(trainKm: number, aheadKm = 4, behindKm = 1.6): Place[] {
  return PLACES.filter(place => {
    const delta = place.km - trainKm;
    return delta <= aheadKm && delta >= -behindKm;
  }).sort((a, b) => Math.abs(a.km - trainKm) - Math.abs(b.km - trainKm));
}
