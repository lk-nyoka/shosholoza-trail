/**
 * Shosholoza Trail — Vector AI Engine
 *
 * Replaces the simple string.includes() lookup with a TF-IDF scored
 * corpus search over a structured knowledge base. Every document is
 * pre-tokenised and indexed at module load time (zero runtime cost).
 *
 * Architecture
 * ─────────────
 * 1. CORPUS — an array of documents, each with:
 *    - id, stopId, type (factual / historical / food / nature / booking)
 *    - text  — the retrievable answer text
 *    - tags  — explicit keyword signals that boost recall
 *
 * 2. Tokeniser — lowercases, strips punctuation, splits on whitespace.
 *    Removes a short stop-word list so "what", "is", "the" don't affect scoring.
 *
 * 3. TF-IDF index — built once over the corpus.
 *    TF  = term frequency within a document (normalised by doc length)
 *    IDF = log( N / df ) where df = number of docs containing the term
 *
 * 4. query(text) — tokenises the query, scores every doc, returns the
 *    top-K results sorted by descending score.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type DocType = "factual" | "historical" | "food" | "nature" | "booking" | "transit";

export interface CorpusDoc {
  id:     string;
  stopId: string;
  type:   DocType;
  title:  string;
  text:   string;
  tags:   string[];
}

export interface SearchResult {
  doc:   CorpusDoc;
  score: number;
}

// ── Corpus ───────────────────────────────────────────────────────────────────

export const CORPUS: CorpusDoc[] = [
  // ── Pretoria ──────────────────────────────────────────────────────────────
  {
    id: "pretoria-overview", stopId: "pretoria", type: "factual",
    title: "Pretoria overview",
    text: "Pretoria is the administrative capital of South Africa and the starting point of the 1 568 km Shosholoza Trail to Cape Town. Known as the Jacaranda City, it blooms violet every October. The city sits on the Highveld at 1 339 m above sea level.",
    tags: ["pretoria", "capital", "jacaranda", "start", "origin", "gauteng"],
  },
  {
    id: "pretoria-union", stopId: "pretoria", type: "factual",
    title: "Union Buildings",
    text: "The Union Buildings at Meintjieskop are the official seat of the South African government. The terraced gardens offer a panoramic view over the city. The Nelson Mandela statue stands at the forecourt. Distance from station: 3.8 km.",
    tags: ["union buildings", "government", "gardens", "mandela", "landmark", "sight"],
  },
  {
    id: "pretoria-market", stopId: "pretoria", type: "food",
    title: "Church Square Makers Market",
    text: "The Church Square Makers Market, 1.2 km from Pretoria station, sells locally made beadwork, hand-printed fabrics and small-batch gifts. Open Thursday to Sunday. Rated 4.6 by visitors. Price range: R (affordable).",
    tags: ["market", "craft", "beadwork", "gifts", "buy", "shop", "vendor"],
  },
  {
    id: "pretoria-freedom", stopId: "pretoria", type: "historical",
    title: "Freedom Park",
    text: "Freedom Park at Salvokop, 4.1 km from Pretoria station, is a national heritage site commemorating South Africa's conflicts and democratic transition. The Garden of Remembrance holds the names of the fallen. Rated 4.6.",
    tags: ["freedom park", "heritage", "history", "democracy", "memorial", "culture"],
  },

  // ── Johannesburg ──────────────────────────────────────────────────────────
  {
    id: "joburg-overview", stopId: "johannesburg", type: "historical",
    title: "Johannesburg overview",
    text: "Johannesburg, 69 km from Pretoria, is South Africa's largest city and financial capital, built on the gold rush of 1886. The city is reinventing itself with world-class arts precincts, restaurants and contemporary architecture.",
    tags: ["johannesburg", "joburg", "gold", "city", "gauteng"],
  },
  {
    id: "joburg-maboneng", stopId: "johannesburg", type: "factual",
    title: "Maboneng Precinct",
    text: "Maboneng Precinct, 2.4 km from Park Station, is Johannesburg's creative hub with street art, independent galleries, design studios and weekend markets. The neighbourhood pulses with energy from Friday afternoon through Sunday. Rated 4.5.",
    tags: ["maboneng", "arts", "gallery", "street art", "creative", "weekend", "market"],
  },
  {
    id: "joburg-constitution", stopId: "johannesburg", type: "historical",
    title: "Constitution Hill",
    text: "Constitution Hill, 3.1 km from Park Station, houses the Constitutional Court built on the grounds of the Old Fort prison. Guided tours trace South Africa's journey from apartheid to democracy. Rated 4.7.",
    tags: ["constitution hill", "court", "prison", "apartheid", "history", "tour"],
  },
  {
    id: "joburg-rosebank", stopId: "johannesburg", type: "food",
    title: "Rosebank Sunday Market",
    text: "The Rosebank Sunday Market, 8.7 km from Park Station, fills the rooftop of the Rosebank Mall with African crafts, vibrant food stalls, live music and sweeping city views. Open every Sunday. Price range: RR.",
    tags: ["rosebank", "market", "food", "crafts", "sunday", "vendor", "buy"],
  },

  // ── Kimberley ─────────────────────────────────────────────────────────────
  {
    id: "kimberley-overview", stopId: "kimberley", type: "historical",
    title: "Kimberley overview",
    text: "Kimberley, 552 km from Pretoria, is the diamond capital of South Africa. The city was founded in 1871 after diamonds were discovered at Colesberg Kopje. The Big Hole is one of the largest hand-dug excavations in the world at 463 m wide and 240 m deep.",
    tags: ["kimberley", "diamond", "history", "northern cape", "big hole"],
  },
  {
    id: "kimberley-bighole", stopId: "kimberley", type: "factual",
    title: "The Big Hole",
    text: "The Big Hole open-air museum is 1.8 km from Kimberley station. It spans 463 metres wide and plunges 240 metres deep. The museum shows reconstructed 1880s Kimberley buildings including a pub, a bowling alley and a church. Rated 4.5.",
    tags: ["big hole", "mine", "museum", "diamond", "dig", "hole", "kimberley"],
  },
  {
    id: "kimberley-craft", stopId: "kimberley", type: "food",
    title: "Diamond City Collective",
    text: "Diamond City Collective, 1.5 km from Kimberley station, is a curated studio selling Northern Cape ceramics, hand-stitched leatherwork and locally woven textiles. Rated 4.8. Price range: RR.",
    tags: ["diamond city", "collective", "ceramics", "leather", "textiles", "craft", "buy", "shop"],
  },

  // ── De Aar ────────────────────────────────────────────────────────────────
  {
    id: "de-aar-overview", stopId: "de-aar", type: "historical",
    title: "De Aar overview",
    text: "De Aar, 788 km from Pretoria, is one of South Africa's most important railway junctions. The name means 'the vein' in Afrikaans, referring to an underground water source. The town sits in the vast semi-arid Karoo under skies almost entirely free of light pollution.",
    tags: ["de aar", "junction", "railway", "karoo", "northern cape", "sky", "stars"],
  },
  {
    id: "de-aar-walk", stopId: "de-aar", type: "historical",
    title: "Railway Heritage Walk",
    text: "The De Aar Railway Heritage Walk, only 0.6 km from the station, traces the story of one of Africa's busiest rail junctions through original infrastructure, old rolling stock and interpretive signage. Rated 4.3. Free entry.",
    tags: ["railway", "heritage", "walk", "history", "junction", "locomotive", "train"],
  },
  {
    id: "de-aar-pantry", stopId: "de-aar", type: "food",
    title: "Karoo Pantry",
    text: "Karoo Pantry, 1.1 km from De Aar station, is a beloved roadside stop serving fresh roosterkoek (roasted rolls), home-made preserves, biltong and road-trip snacks. Rated 4.7. Price range: R (very affordable).",
    tags: ["karoo pantry", "food", "roosterkoek", "biltong", "eat", "snack", "pantry", "buy"],
  },

  // ── Beaufort West ─────────────────────────────────────────────────────────
  {
    id: "beaufort-overview", stopId: "beaufort", type: "nature",
    title: "Beaufort West overview",
    text: "Beaufort West, 1 047 km from Pretoria, is the largest town in the Karoo and the gateway to the Karoo National Park. The area is famous for fossil beds, diverse reptile life and extraordinarily clear night skies rated among the best stargazing sites in the southern hemisphere.",
    tags: ["beaufort west", "karoo", "fossils", "stars", "stargazing", "western cape"],
  },
  {
    id: "beaufort-park", stopId: "beaufort", type: "nature",
    title: "Karoo National Park",
    text: "Karoo National Park is 7.5 km from Beaufort West station. The park covers 90 000 hectares of dramatic koppies, dry river beds and open plains. Wildlife includes black rhinoceros, Cape mountain zebra, springbok and over 200 bird species. Rated 4.7.",
    tags: ["karoo national park", "park", "wildlife", "rhino", "zebra", "bird", "nature", "hike"],
  },
  {
    id: "beaufort-deli", stopId: "beaufort", type: "food",
    title: "Salt & Stone Deli",
    text: "Salt & Stone Deli, 1.4 km from Beaufort West station, serves Karoo lamb pies, slow-braised ribs, house-made preserves and custom picnic boxes. Ingredients are sourced from farms within 50 km. Rated 4.8. Price range: RR.",
    tags: ["salt stone", "deli", "karoo lamb", "eat", "food", "lunch", "picnic", "local"],
  },

  // ── Matjiesfontein ────────────────────────────────────────────────────────
  {
    id: "matjies-overview", stopId: "matjies", type: "historical",
    title: "Matjiesfontein overview",
    text: "Matjiesfontein, 1 277 km from Pretoria, is a single-street Victorian village perfectly preserved since the 1880s. James Douglas Logan built a health resort here in 1884 and the town served as a military base during the Anglo-Boer War. The station is a national monument.",
    tags: ["matjiesfontein", "victorian", "village", "history", "1880", "boer war", "karoo"],
  },
  {
    id: "matjies-milner", stopId: "matjies", type: "booking",
    title: "Lord Milner Hotel",
    text: "The Lord Milner Hotel is a Victorian landmark 0.2 km from the Matjiesfontein platform. Originally built in 1899, it has hosted royalty, politicians and celebrities. The hotel offers en-suite rooms decorated with period antiques, a formal dining room serving Cape cuisine, a bar and a billiard room. Rated 4.6. Tariff from R1 800 per room per night.",
    tags: ["lord milner", "hotel", "book", "stay", "accommodation", "dining", "victorian", "restaurant", "matjiesfontein"],
  },
  {
    id: "matjies-coffee", stopId: "matjies", type: "food",
    title: "The Coffee House",
    text: "The Coffee House is the only café on Matjiesfontein's single preserved street, 0.1 km from the platform. It serves homemade koeksisters, rusks and freshly brewed coffee. Rated 4.5. Price range: R (affordable).",
    tags: ["coffee house", "coffee", "cafe", "bake", "eat", "snack", "koeksister", "matjiesfontein"],
  },

  // ── Worcester ─────────────────────────────────────────────────────────────
  {
    id: "worcester-overview", stopId: "worcester", type: "nature",
    title: "Worcester overview",
    text: "Worcester, 1 425 km from Pretoria, sits in the Breede River Valley surrounded by the Hex River Mountains. The valley produces some of South Africa's best table grapes and stone fruit. Winemaking is a major industry with over 20 cellars within 30 km.",
    tags: ["worcester", "breede", "valley", "wine", "vineyard", "western cape", "fruit"],
  },
  {
    id: "worcester-garden", stopId: "worcester", type: "nature",
    title: "Karoo Desert National Botanical Garden",
    text: "The Karoo Desert National Botanical Garden, 3.2 km from Worcester station, holds the world's largest living collection of Karoo succulents. Views stretch across the valley to the Hex River Mountains. Rated 4.6.",
    tags: ["botanical garden", "succulents", "garden", "nature", "plants", "mountain", "view"],
  },
  {
    id: "worcester-pantry", stopId: "worcester", type: "food",
    title: "Breede Valley Pantry",
    text: "Breede Valley Pantry, 2.1 km from Worcester station, stocks farm-fresh seasonal fruit, local wine, artisan preserves and cold-pressed juices from surrounding farms. Rated 4.8. Price range: RR.",
    tags: ["breede valley pantry", "wine", "fruit", "preserves", "buy", "shop", "food", "local"],
  },

  // ── Cape Town ─────────────────────────────────────────────────────────────
  {
    id: "cape-town-overview", stopId: "cape-town", type: "factual",
    title: "Cape Town overview",
    text: "Cape Town, 1 568 km from Pretoria, is the legislative capital and the final destination of the Shosholoza Trail. The city is set between Table Mountain National Park and two oceans. It is consistently rated among the world's most beautiful cities.",
    tags: ["cape town", "end", "final", "destination", "mountain", "ocean", "western cape"],
  },
  {
    id: "cape-town-mountain", stopId: "cape-town", type: "nature",
    title: "Table Mountain",
    text: "Table Mountain is 6.8 km from Cape Town station. The flat-topped sandstone massif rises 1 086 m above sea level. The aerial cableway runs every 10 minutes on clear days. The summit holds 1 470 plant species found nowhere else on earth. Rated 4.9.",
    tags: ["table mountain", "mountain", "hike", "cableway", "view", "summit", "nature"],
  },
  {
    id: "cape-town-watershed", stopId: "cape-town", type: "booking",
    title: "The Watershed",
    text: "The Watershed at the V&A Waterfront, 2.9 km from Cape Town station, is a curated design market with over 150 stalls of independent South African designers, jewellers, ceramicists and textile artists. Open daily 09:00–21:00. Rated 4.7. Price range: RR.",
    tags: ["watershed", "market", "design", "craft", "shop", "buy", "waterfront", "stall"],
  },
  {
    id: "cape-town-bokaap", stopId: "cape-town", type: "historical",
    title: "Bo-Kaap",
    text: "The Bo-Kaap, 2.2 km from Cape Town station, is the historic Cape Malay quarter. The neighbourhood's brightly painted houses date from the 18th century. Walking tours take in the spice markets, mosques and cooking demonstrations. Rated 4.7.",
    tags: ["bo-kaap", "bo kaap", "cape malay", "colour", "malay", "history", "culture", "walk", "mosque"],
  },

  // ── Journey / transit facts ───────────────────────────────────────────────
  {
    id: "journey-duration", stopId: "_route", type: "transit",
    title: "Journey duration",
    /**
     * Written from the same timetable the rest of the app uses.
     *
     * This document used to say 06:00 and 09:00 for a 27-hour run, while the
     * boarding pass and the schedule table said 08:30 and 12:40 for 28h 10m.
     * One knowledge base contradicting the page beside it is exactly what
     * "verified" is supposed to rule out.
     */
    text: "The Shosholoza Meyl train from Pretoria to Cape Town covers 1 568 km. The published schedule departs Pretoria at 08:30 and arrives in Cape Town at 12:40 the following day — 28 hours and 10 minutes, or about 26 hours 40 minutes from Johannesburg. These are scheduled times: delays of several hours are ordinary on this line, and this app receives no live running information from the operator. The train makes 8 story stops along the way, and also calls at Klerksdorp, Wellington and Bellville.",
    tags: ["how long", "duration", "hours", "time", "journey", "travel", "depart", "arrive", "schedule"],
  },
  {
    id: "journey-offline", stopId: "_route", type: "transit",
    title: "Offline capability",
    text: "Shosholoza Trail works offline. The app caches the full rail route geometry, all stop guides and destination photos before you board. In low-connectivity regions like the Karoo between De Aar and Beaufort West, the map and guides continue to work from local storage.",
    tags: ["offline", "no signal", "karoo", "connectivity", "cache", "internet", "dead zone"],
  },
  {
    id: "journey-boarding", stopId: "_route", type: "transit",
    title: "Auto-board feature",
    text: "The Live Journey page can automatically detect your position on the rail corridor. Tap 'Locate me on the route' and the app uses your device GPS to snap your position to the nearest railway km, so the map starts showing local vendors and attractions immediately.",
    tags: ["gps", "locate", "board", "auto", "position", "find me", "snap", "where am i"],
  },
];

// ── Tokeniser ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","shall","should",
  "may","might","must","can","could","to","of","in","on","at","by",
  "for","with","about","into","from","and","or","but","not","what",
  "which","who","how","when","where","why","this","that","these","those",
  "it","its","i","me","my","we","our","you","your","he","she","they",
  "their","there","tell","me","give","some",
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

// ── TF-IDF index ─────────────────────────────────────────────────────────────

interface DocVector {
  doc:    CorpusDoc;
  tf:     Map<string, number>;
  tokens: string[];
}

function buildIndex(corpus: CorpusDoc[]): { vectors: DocVector[]; idf: Map<string, number> } {
  const vectors: DocVector[] = corpus.map(doc => {
    const tokens = tokenise(`${doc.title} ${doc.text} ${doc.tags.join(" ")}`);
    const freq   = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    const tf = new Map<string, number>();
    for (const [term, count] of freq) tf.set(term, count / tokens.length);
    return { doc, tf, tokens };
  });

  // Document frequency
  const df = new Map<string, number>();
  for (const { tf } of vectors) {
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const N   = corpus.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log((N + 1) / (count + 1)) + 1);

  return { vectors, idf };
}

const { vectors: INDEX_VECTORS, idf: INDEX_IDF } = buildIndex(CORPUS);

// ── Public query function ─────────────────────────────────────────────────────

export function query(text: string, topK = 3): SearchResult[] {
  const qTokens = tokenise(text);
  if (qTokens.length === 0) return [];

  const scores = INDEX_VECTORS.map(({ doc, tf }) => {
    let score = 0;
    for (const qt of qTokens) {
      const termTf  = tf.get(qt) ?? 0;
      const termIdf = INDEX_IDF.get(qt) ?? Math.log((CORPUS.length + 1) / 1);
      score += termTf * termIdf;
    }
    // Exact tag match bonus — rewards very specific queries
    const lower = text.toLowerCase();
    for (const tag of doc.tags) {
      if (lower.includes(tag)) score += 0.25;
    }
    return { doc, score };
  });

  return scores
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── Answer synthesiser ────────────────────────────────────────────────────────

export function answer(userInput: string): string {
  const results = query(userInput, 2);
  if (results.length === 0 || results[0].score < 0.005) {
    return "I can answer questions about any of the eight stops on the Shosholoza Trail: Pretoria, Johannesburg, Kimberley, De Aar, Beaufort West, Matjiesfontein, Worcester and Cape Town. Try asking about food, history, attractions, accommodation or the journey itself.";
  }
  // If top two docs are from the same stop / same type, merge them for richer context
  const top = results[0].doc;
  const second = results[1];
  if (second && second.doc.stopId === top.stopId && second.score > results[0].score * 0.6) {
    return `${top.text}\n\n${second.doc.text}`;
  }
  return top.text;
}
