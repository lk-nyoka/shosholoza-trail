/**
 * What the line gives you, and where.
 *
 * One schema for every mode. An experience is anchored to a stretch of track,
 * tagged with the mode it belongs to, and carries its own sources. The engine
 * picks by kilometre and mode; nothing here knows about a screen.
 *
 * Two rules this file keeps, because the whole project keeps them:
 *
 *   - `source` is a real, checkable reference or the entry does not ship. No
 *     anonymous tourism copy.
 *   - `reviewedBy` is null until a person has actually read it. It is not a
 *     field to fill in with a plausible name; a blank one is the honest state
 *     and the app says "not yet reviewed" rather than implying otherwise.
 */
import type { Mode } from "../lib/modes";

export type Activity =
  | { kind: "question"; prompt: string; options: string[]; answer: number; because: string }
  | { kind: "write"; prompt: string; lines: number }
  | { kind: "look"; prompt: string; side: "left" | "right" | "either" }
  | { kind: "room"; topic: string; blurb: string }
  /**
   * Sends the passenger somewhere a recording can be played properly.
   *
   * Deliberately a link and not an embedded player. The recordings are other
   * people's copyright, they are not in the offline package, and they belong on
   * the page that carries their credits and rights notice — not floating over
   * the 3D view where none of that fits. Nothing plays until it is tapped.
   */
  | { kind: "listen"; prompt: string; cta: string; to: string };

export interface Experience {
  id: string;
  mode: Mode;
  title: string;
  /** Where on the line this wakes up, in route kilometres. */
  fromKm: number;
  toKm: number;
  stopId: string | null;
  /** Roughly how long it takes, so nobody starts a ten-minute thing at a stop. */
  minutes: number;
  /** The 60-second version. */
  summary: string;
  /** The whole thing. */
  story?: string;
  /** Why this is in the app at all. */
  matters?: string;
  activity?: Activity;
  /** Earned on completion. Personal, not a leaderboard. */
  stamp?: { id: string; name: string };
  source?: { text: string; url?: string };
  /** Null until a human has checked it. Displayed honestly either way. */
  reviewedBy: string | null;
}

export const EXPERIENCES: Experience[] = [
  // ── Adventure: stories, quizzes and challenges ──────────────────────────
  // ── Shosholoza: the song as a thread through the journey ───────────────
  //
  // Four moments, not one page. The song opens the journey, is examined in the
  // middle of it, is answered creatively, and returns at the end so that the
  // last time a passenger hears it they have 1 568 km behind them. No recording
  // is embedded here: these point at the page that carries the credits.
  {
    id: "shosholoza-opening",
    mode: "adventure",
    title: "The journey begins with a song",
    fromKm: 0,
    toKm: 25,
    stopId: "pretoria",
    minutes: 2,
    summary:
      "Before Shosholoza became associated with sport and national celebration, it " +
      "carried memories of work, migration, movement and collective endurance.",
    story:
      "You are on the line the song is about.\n\n" +
      "Shosholoza is a work song. It was sung by men travelling to and labouring in " +
      "the mines of southern Africa — on contracts, in closed compounds, and on the " +
      "railways that carried them there and back. It is call-and-response, which is " +
      "what makes it useful: one voice sets the line, the rest answer, and the " +
      "answering keeps a group moving together.\n\n" +
      "The sound at the start of the word is a steam engine. The train in the song " +
      "and the train you are sitting on are the same kind of thing.",
    matters:
      "The song is the reason this app has its name, and the corridor is the reason " +
      "the song exists. Starting here is not decoration.",
    activity: {
      kind: "listen",
      prompt: "Two recordings, a lifetime apart. Nothing plays until you press play.",
      cta: "Listen to Shosholoza",
      to: "/shosholoza",
    },
    stamp: { id: "first-song", name: "The First Song" },
    source: {
      text: "Shosholoza: Then and Now — recordings credited on the song page.",
    },
    reviewedBy: null,
  },
  {
    id: "shosholoza-compare",
    mode: "adventure",
    title: "Then and now: what changed in the singing",
    fromKm: 600,
    toKm: 780,
    stopId: null,
    minutes: 8,
    summary:
      "You have just passed the diamond fields. Listen to an older recording of " +
      "Shosholoza and a modern one, and work out what survived the journey between them.",
    story:
      "Do this in order, and give it the time it needs.\n\n" +
      "1. Listen to the older recording all the way through.\n" +
      "2. Listen to the modern one.\n" +
      "3. Name one thing that changed — the rhythm, what is playing behind the " +
      "voices, how many people answer, how it makes you feel.\n" +
      "4. Name one thing you would still recognise anywhere.\n" +
      "5. Then read where the song comes from, on the song page.\n\n" +
      "The song moved from mine compounds to stadiums inside a single lifetime. " +
      "Both recordings are the same song and neither is the wrong version of it.",
    matters:
      "A song that survives that much change is carrying something people needed to " +
      "keep. Working out what that is by ear is a better lesson than being told.",
    activity: {
      kind: "question",
      prompt:
        "How can the same song carry memories of hardship, solidarity, movement and " +
        "celebration across different generations?",
      options: [
        "Because the words were rewritten each time to suit the new occasion",
        "Because a call-and-response song belongs to whoever is singing it, so each " +
          "generation brings its own reason for needing it",
        "Because the original meaning was forgotten, leaving only the tune",
        "Because it was formally adopted as an anthem and given a new purpose",
      ],
      answer: 1,
      because:
        "Call-and-response has no single author and no fixed performance. The people " +
        "singing supply the meaning, which is why the song could move from labour to " +
        "protest to celebration without needing to be rewritten — and why the older " +
        "meanings travel with it rather than being replaced.",
    },
    stamp: { id: "then-and-now", name: "Then and Now" },
    source: {
      text: "Shosholoza: Then and Now — both recordings and their sources are on the song page.",
    },
    reviewedBy: null,
  },
  {
    id: "shosholoza-verse",
    mode: "creative",
    title: "A verse for this window",
    fromKm: 560,
    toKm: 800,
    stopId: null,
    minutes: 6,
    summary:
      "Shosholoza was made up by people looking out of a train at this country. " +
      "Write something of your own about what is outside your window right now.",
    story:
      "Pick one. There is no right length and nobody is going to read it.\n\n" +
      "· Write a verse about what is outside the window, in whatever language you " +
      "think in.\n" +
      "· Describe how the older recording and the modern one feel different, in one " +
      "sentence each.\n" +
      "· Make a sound postcard: write down three things you can hear right now, and " +
      "where you are.\n" +
      "· If you would rather speak than write, say it out loud to yourself first and " +
      "then write down only the part you want to keep.\n\n" +
      "Please write your own words rather than copying the song's.",
    matters:
      "The song exists because somebody on a train put words to what they saw. " +
      "Doing the same thing is a better way of understanding it than reading about it.",
    activity: {
      kind: "write",
      prompt: "Your verse, in your own words.",
      lines: 5,
    },
    stamp: { id: "own-verse", name: "Your Own Verse" },
    source: { text: "Original prompt. No lyrics reproduced." },
    reviewedBy: null,
  },
  {
    id: "shosholoza-return",
    mode: "adventure",
    title: "Listen again",
    fromKm: 1480,
    toKm: 1568,
    stopId: "cape-town",
    minutes: 3,
    summary:
      "You have followed the railway across the country. Listen again. Does the song " +
      "mean something different now?",
    story:
      "When you heard it outside Pretoria you had 1 568 km ahead of you and no " +
      "particular reason to care about a work song.\n\n" +
      "Since then you have passed the fields at Kimberley that the compounds were " +
      "built for, crossed the Karoo that the labour recruits crossed, and come down " +
      "through the Hex River. The men in the song made this journey too, in the " +
      "other direction and for a different reason.\n\n" +
      "That is the whole experiment. Same song, same recordings, different listener.",
    matters:
      "Ending where the app started, with the passenger changed rather than the " +
      "content changed, is the only ending this journey needs.",
    activity: {
      kind: "listen",
      prompt: "One more time, now that you have been the whole way.",
      cta: "Listen again",
      to: "/shosholoza",
    },
    stamp: { id: "full-circle", name: "Full Circle" },
    source: {
      text: "Shosholoza: Then and Now — recordings credited on the song page.",
    },
    reviewedBy: null,
  },

  {
    id: "kimberley-diamonds",
    mode: "adventure",
    title: "The hole that built the railway",
    fromKm: 500,
    toKm: 560,
    stopId: "kimberley",
    minutes: 3,
    summary:
      "The line you are on exists because of what was dug out of the ground here. " +
      "Diamonds were found on the farm Vooruitzicht in 1871, and within a decade " +
      "Kimberley was the largest settlement in the interior of southern Africa — " +
      "reached by rail from the Cape in 1885, years before Johannesburg had a station.",
    story:
      "The railway from Cape Town was not built to carry passengers. It was built to " +
      "carry machinery in and diamonds out, and the route it took is the route this " +
      "train still follows.\n\n" +
      "The workforce that dug the mines came from across the subcontinent — from " +
      "Pedi, Tsonga, Sotho and Xhosa-speaking areas, often walking for weeks to reach " +
      "the diggings. Black miners were housed in closed compounds from the mid-1880s: " +
      "fenced, searched on exit, and unable to leave for the length of a contract. " +
      "That compound system did not stay in Kimberley. It became the template for the " +
      "gold mines on the Witwatersrand, and the migrant labour pattern it created " +
      "shaped South African cities for the next hundred years.\n\n" +
      "So the Big Hole is not only a hole. It is where a labour system was invented, " +
      "and this line is one of the things it paid for.",
    matters:
      "Every stop between here and Johannesburg was placed by the same economics. " +
      "Knowing that changes what the next four hundred kilometres look like.",
    activity: {
      kind: "question",
      prompt: "Kimberley was connected to the Cape by rail in 1885. Why did the line get built at all?",
      options: [
        "To move settlers to the interior",
        "To carry mining machinery in and diamonds out",
        "To link the Cape to Johannesburg's gold fields",
      ],
      answer: 1,
      because:
        "Gold on the Witwatersrand was only found in 1886 — a year after the line " +
        "reached Kimberley. The railway came for the diamonds first.",
    },
    stamp: { id: "diamond-fields", name: "Diamond Fields" },
    source: {
      text: "McCracken, ‘The Kimberley compound system’; South African History Online, ‘Kimberley’",
      url: "https://www.sahistory.org.za/place/kimberley",
    },
    reviewedBy: null,
  },
  {
    id: "karoo-floor",
    mode: "adventure",
    title: "You are crossing an ancient seabed",
    fromKm: 800,
    toKm: 1150,
    stopId: "beaufort",
    minutes: 2,
    summary:
      "The flat ground outside was the floor of an inland sea. The Karoo Supergroup " +
      "holds one of the most complete records anywhere of life before and after the " +
      "end-Permian extinction, about 252 million years ago — the largest die-off in " +
      "Earth's history. The flat-topped koppies are dolerite: magma that pushed " +
      "between the layers and proved harder than the rock above it.",
    matters:
      "The reason the line runs straight here, and the reason the hills all stop at " +
      "the same height, are the same reason.",
    activity: {
      kind: "look",
      prompt: "Find a koppie with a flat top and a darker cap. That cap is the dolerite that saved it from eroding.",
      side: "either",
    },
    stamp: { id: "karoo-floor", name: "Karoo Seabed" },
    source: {
      text: "Council for Geoscience, Karoo Supergroup; Rubidge, Beaufort Group biostratigraphy",
    },
    reviewedBy: null,
  },
  {
    id: "hex-river-tunnels",
    mode: "adventure",
    title: "Four tunnels and a mountain in the way",
    fromKm: 1330,
    toKm: 1400,
    stopId: "worcester",
    minutes: 2,
    summary:
      "Getting down from the Karoo plateau to the Cape lowlands means losing about " +
      "600 metres through the Hex River mountains. The original 1870s line climbed " +
      "around them on tight curves and steep grades. The modern route runs through " +
      "four tunnels — the longest over 13 km, the longest railway tunnel in South " +
      "Africa — opened in 1989 after more than a decade of work.",
    matters:
      "This is the most engineered stretch of the whole 1 568 km, and most passengers " +
      "sleep through it.",
    activity: {
      kind: "question",
      prompt: "Why build 13 km of tunnel instead of keeping the old mountain line?",
      options: [
        "The old line was destroyed by flooding",
        "To cut the gradient so longer, heavier trains could work the route",
        "To shorten the journey by several hours",
      ],
      answer: 1,
      because:
        "Grade, not distance, is what limits a freight railway. Easing the climb let " +
        "far heavier trains run without extra locomotives.",
    },
    stamp: { id: "hex-river", name: "Hex River Crossing" },
    source: { text: "Transnet Freight Rail, Hex River tunnel complex" },
    reviewedBy: null,
  },

  {
    id: "matjiesfontein-logan",
    mode: "adventure",
    title: "A village built out of a railway contract",
    fromKm: 1235,
    toKm: 1300,
    stopId: "matjies",
    minutes: 3,
    summary:
      "Matjiesfontein exists because trains had to stop somewhere for water, and one " +
      "man understood what that was worth. James Logan, a Scottish railwayman who had " +
      "come to the Karoo for his health, took the refreshment-room concession for the " +
      "Cape railways and built a village around his stop in the 1880s and 1890s.",
    story:
      "Before dining cars, a long-distance train had to halt so that passengers could " +
      "eat. Whoever held the refreshment-room contract held a small monopoly on every " +
      "hungry traveller on the system, and Logan held it across the Cape network.\n\n" +
      "He used it to turn a watering halt into a health resort — the dry Karoo air was " +
      "prescribed for tuberculosis at the time — with a hotel, a cricket ground and " +
      "imported London street lamps. The way he obtained and kept that concession " +
      "became a political row in the Cape parliament in the 1890s.\n\n" +
      "During the South African War the village became a British military base, and " +
      "the Lord Milner Hotel was used as a hospital. Almost nothing has been built " +
      "since, which is why the street outside still looks like the 1890s.",
    matters:
      "Most towns on this line were placed by the railway. Matjiesfontein is the one " +
      "where you can still see exactly what the railway placed, and why.",
    activity: {
      kind: "look",
      prompt:
        "The hotel is about 100 m from the platform, on the right going south. Look for " +
        "the Victorian street lamps along the front — they were shipped from London.",
      side: "right",
    },
    stamp: { id: "matjiesfontein", name: "Matjiesfontein" },
    source: {
      text: "South African History Online, ‘Matjiesfontein’; Heritage Western Cape, national heritage site declaration",
      url: "https://www.sahistory.org.za/place/matjiesfontein",
    },
    reviewedBy: null,
  },

  // ── Creative: made on the train, kept on the phone ──────────────────────
  // Device-local by design. Nothing is uploaded, nothing is published, so there
  // is no moderation, copyright or stored-XSS surface to hand-wave about.
  {
    id: "karoo-four-lines",
    mode: "creative",
    title: "Four lines about what is out there",
    fromKm: 800,
    toKm: 1330,
    stopId: null,
    minutes: 4,
    summary:
      "The Karoo is the longest stretch of the journey and the emptiest. Write four " +
      "lines about it while you are in it. Nobody else sees this unless you show them.",
    activity: { kind: "write", prompt: "Four lines about the Karoo outside your window.", lines: 4 },
    stamp: { id: "karoo-lines", name: "Karoo Notebook" },
    reviewedBy: null,
  },
  {
    id: "jacaranda-postcard",
    mode: "creative",
    title: "A postcard from the first hour",
    fromKm: 0,
    toKm: 70,
    stopId: "pretoria",
    minutes: 3,
    summary:
      "Pretoria to Johannesburg is the one stretch with jacarandas along the line. " +
      "Make a postcard stamped with the kilometre you made it at.",
    activity: { kind: "write", prompt: "One line for the back of the postcard.", lines: 1 },
    stamp: { id: "first-hour", name: "First Hour" },
    reviewedBy: null,
  },

  // ── Networking: a topic, never a passenger list ─────────────────────────
  // A room is a topic, not a passenger list. Nobody's name, number or location
  // is exposed by joining one; you meet in person or you do not meet.
  {
    id: "room-builders",
    mode: "networking",
    title: "Builders on this train",
    fromKm: 0,
    toKm: 1568,
    stopId: null,
    minutes: 1,
    summary:
      "For people on this service who write software, build hardware or run something. " +
      "Joining shows the coach you are in and nothing else.",
    activity: {
      kind: "room",
      topic: "Builders",
      blurb: "Developers, makers, founders. Say what you are working on, not who you are.",
    },
    reviewedBy: null,
  },
  {
    id: "room-students",
    mode: "networking",
    title: "Students heading to the same place",
    fromKm: 0,
    toKm: 1568,
    stopId: null,
    minutes: 1,
    summary:
      "Conferences, campuses, competitions. Useful when thirty people on one train are " +
      "going to the same building and none of them know it.",
    activity: {
      kind: "room",
      topic: "Students",
      blurb: "Where are you headed, and what for?",
    },
    reviewedBy: null,
  },
  {
    id: "room-photography",
    mode: "networking",
    title: "People photographing the line",
    fromKm: 0,
    toKm: 1568,
    stopId: null,
    minutes: 1,
    summary:
      "Which side the light is on, what is coming up, where the train slows enough to " +
      "shoot from a window.",
    activity: {
      kind: "room",
      topic: "Photography",
      blurb: "Swap what is worth watching for, and which window to be at.",
    },
    reviewedBy: null,
  },
];
