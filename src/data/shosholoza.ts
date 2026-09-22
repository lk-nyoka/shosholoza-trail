/**
 * "Shosholoza: Then and Now" — the two recordings, and what we may say about them.
 *
 * This is the app's strongest cultural moment and also its largest legal risk,
 * so the rules are written into the data rather than left to whoever builds the
 * screen.
 *
 * WHAT WE HAVE THE RIGHT TO DO
 *
 *   A YouTube link is not permission to download or redistribute audio. The
 *   underlying song is traditional, but every particular recording carries its
 *   own copyright — in the performance, and usually in the master. So:
 *
 *     - Play only through the official YouTube embed, on the passenger's tap.
 *     - Never autoplay.
 *     - Never download, cache, extract or bundle the audio.
 *     - Never include either recording in the offline package.
 *     - Never present either recording as ours.
 *
 *   Offline playback would need written permission from the rights holder of
 *   that recording, or a performance we commission and licence ourselves.
 *   Until then `offlineAvailable` stays false and the UI says why.
 *
 * WHAT WE DO NOT YET KNOW
 *
 *   The performer, channel, publication date and rights holder of both
 *   recordings are UNVERIFIED. Automated retrieval of YouTube metadata was
 *   blocked, and inventing a credit is worse than showing none — a wrong
 *   attribution on a cultural work is the kind of mistake that ends a project's
 *   credibility. Every unknown field below is null, the screen renders
 *   "Not yet verified" in its place, and `metadataVerified` gates the whole
 *   credits block. Fill these in only from the video pages themselves.
 *
 * WHAT NEEDS A CULTURAL REVIEWER
 *
 *   Languages, historical interpretation and any translation must be checked by
 *   an appropriate language or cultural specialist before they are presented as
 *   fact. `reviewedBy` is null until that has actually happened.
 */

export interface Recording {
  id: "modern" | "older";
  /** How the app refers to it in its own voice. */
  label: string;
  /** One line on why this recording is here. Ours to write; not a claim about the record. */
  whyIncluded: string;
  /** YouTube video id. Embedded, never downloaded. */
  youTubeId: string;
  /** The page a passenger should open to see the real credits. */
  watchUrl: string;

  // ── Credits. Null means nobody has checked yet. Do not guess. ────────────
  /** Title exactly as it appears on the video page. */
  title: string | null;
  /** The performer or performers credited on the recording. */
  performer: string | null;
  /** The channel that published it. */
  channel: string | null;
  /** Publication date as shown on the video page, ISO where known. */
  published: string | null;
  /** Who holds the rights in this recording. */
  rightsHolder: string | null;
  /** The licence shown on the video page, e.g. "Standard YouTube Licence". */
  licence: string | null;
}

/**
 * Both recordings, as supplied by the team.
 *
 * The two ids are the only facts here that were given to us directly. Every
 * other field waits for a person to open the page and read it.
 */
export const RECORDINGS: Recording[] = [
  {
    id: "modern",
    label: "The modern version",
    whyIncluded:
      "A contemporary performance — how the song is sung now, and how it has kept " +
      "travelling beyond the work it came from.",
    youTubeId: "7jYdtRTlvgQ",
    watchUrl: "https://www.youtube.com/watch?v=7jYdtRTlvgQ",
    title: null,
    performer: null,
    channel: null,
    published: null,
    rightsHolder: null,
    licence: null,
  },
  {
    id: "older",
    label: "The older version",
    whyIncluded:
      "An earlier performance style, closer to how the song was sung as work rather " +
      "than as performance.",
    youTubeId: "SSoAmPlEweY",
    watchUrl: "https://www.youtube.com/watch?v=SSoAmPlEweY",
    title: null,
    performer: null,
    channel: null,
    published: null,
    rightsHolder: null,
    licence: null,
  },
];

/** True only when every credit on every recording has been filled in by a person. */
export const metadataVerified: boolean = RECORDINGS.every(
  r => r.title && r.performer && r.channel && r.published && r.rightsHolder && r.licence,
);

/**
 * Neither recording may be downloaded or packaged for offline use.
 *
 * Flip this only with written permission from that recording's rights holder,
 * or replace the recording with a performance we have commissioned and licensed.
 */
export const OFFLINE_PERMISSION_OBTAINED = false;

export const OFFLINE_NOTICE =
  "These recordings play from YouTube and are not part of the offline download. " +
  "We have not licensed them for offline use, so they need a connection.";

export const RIGHTS_NOTICE =
  "Both recordings belong to their performers and publishers. Shosholoza Trail does " +
  "not own them, has not altered them, and links to the original videos so you can " +
  "see the full credits.";

// ── What the app says about the song ────────────────────────────────────────

/**
 * The historical note.
 *
 * Written to the same rule as the rest of the corridor content: no romance
 * about the conditions people worked in. The song is beautiful; the compound
 * system it came out of was not, and saying both is the only honest version.
 */
export const HISTORY = {
  short:
    "Before Shosholoza became a song for stadiums, it was a song for work — sung by " +
    "men doing hard labour in southern Africa's mines, and on the trains that carried " +
    "them there and home again.",
  full:
    "Shosholoza is a traditional southern African work song. It is most often " +
    "described as having been sung by migrant labourers travelling to and working in " +
    "the mines of what is now South Africa and Zimbabwe — men who left home on " +
    "contracts, lived in closed compounds for the length of them, and went back by " +
    "the same railways that had brought them.\n\n" +
    "The song is built for work. It is call-and-response, so one voice sets a line " +
    "and the rest answer, and the answering is what keeps a group of people moving at " +
    "the same rhythm — swinging a pick, pushing a cocopan, walking. The repeated " +
    "sound at the start of the word imitates a steam engine, and the train in the " +
    "lyric is the train the singers were on.\n\n" +
    "It is worth being plain about what that means. The rhythm that makes the song " +
    "moving is the rhythm of labour that was badly paid, racially ordered and " +
    "physically dangerous. The endurance in it was not chosen. Treating the song as " +
    "simply uplifting skips the part that made it necessary.\n\n" +
    "Later the song travelled. It was sung in prisons, at political gatherings, at " +
    "funerals and eventually at sports grounds, and by the 1990s it had become one of " +
    "the most widely recognised pieces of music in the country — sung by crowds who " +
    "had never been near a mine. Both things are true at once, and the two recordings " +
    "here are a way of hearing the distance between them.",
  railway:
    "The railway is not a metaphor in this song. The line this app follows carried " +
    "the same traffic the song describes: recruits south to the mines, and the " +
    "machinery and ore that the mines ran on. The train in the lyric and the train " +
    "you are sitting on are the same kind of thing.",
};

/**
 * The languages the song is sung in.
 *
 * Widely reported as Ndebele and Zulu, which are closely related Nguni
 * languages, and sung in mixed forms across the region. Reported, not verified:
 * which language a particular recording uses, and how its words differ, is
 * exactly the sort of claim that needs someone who speaks it. Until a reviewer
 * has confirmed it the screen says so.
 */
export const LANGUAGES = {
  reported: ["Ndebele", "Zulu"],
  note:
    "Commonly described as Ndebele and Zulu — closely related Nguni languages — and " +
    "sung in mixed forms across the region. Which language each of these recordings " +
    "uses has not been checked by a speaker.",
  reviewedBy: null as string | null,
};

/**
 * Line-by-line translation: deliberately absent.
 *
 * Two conditions have to be met before it can ship, and neither has been. It
 * must be legally permitted for the recording concerned, and it must come from
 * a source we can name and a reviewer who can vouch for it. A translation
 * assembled from memory or from an unattributed lyrics site is not acceptable
 * on a page about somebody else's cultural work.
 */
export const TRANSLATION = {
  available: false,
  why:
    "A line-by-line translation is not shown yet. It needs a source we can name and " +
    "a language specialist who has checked it, and we do not have either. A rough " +
    "translation of somebody else's song is worse than none.",
  lines: [] as { original: string; english: string }[],
};

/**
 * How the two recordings differ.
 *
 * These are the things to listen for, written as questions rather than answers,
 * because the answers depend on the recordings and we have not had a musician
 * check ours. A passenger comparing them is doing the exercise properly; a
 * passenger reading our verdict is not.
 */
export const COMPARISON: { aspect: string; listenFor: string }[] = [
  {
    aspect: "Rhythm",
    listenFor:
      "Is the pulse steady enough to work to, or does it stretch and pause for effect? " +
      "A song used to coordinate labour cannot afford rubato.",
  },
  {
    aspect: "Instrumentation",
    listenFor:
      "How much is voices alone, and how much is accompaniment? The song began " +
      "unaccompanied; anything you hear behind it was added later.",
  },
  {
    aspect: "Vocals",
    listenFor:
      "Where is the call and where is the response? Count how many people answer, and " +
      "whether they answer together or overlap.",
  },
  {
    aspect: "Emotional character",
    listenFor:
      "Does it sound like encouragement, lament, celebration, or more than one at " +
      "once? The same words have carried all of these.",
  },
];

/** The creative prompt that closes the experience. */
export const CREATIVE_PROMPT = "What does Shosholoza mean to you?";

/** Everything on this page waits for a cultural reviewer. Null until it happens. */
export const REVIEWED_BY: string | null = null;

export const SOURCE = {
  text:
    "Historical note compiled from published accounts of migrant labour and mine " +
    "compounds in southern Africa. Recording credits to be taken from the video " +
    "pages themselves.",
};
