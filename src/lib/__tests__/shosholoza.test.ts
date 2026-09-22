/**
 * The rules that keep "Shosholoza: Then and Now" lawful and honest.
 *
 * This experience uses two recordings we do not own. A YouTube link is not a
 * licence: the underlying song is traditional, but each recording carries its
 * own copyright in the performance and usually in the master. The rules are
 * simple, and they are the kind that get broken quietly months later by
 * somebody who just wants the demo to work on the train — so they are asserted
 * here and the build fails if any of them slips.
 *
 * Run: npm test
 */
import {
  COMPARISON,
  CREATIVE_PROMPT,
  HISTORY,
  LANGUAGES,
  OFFLINE_PERMISSION_OBTAINED,
  RECORDINGS,
  REVIEWED_BY,
  TRANSLATION,
  metadataVerified,
} from "../../data/shosholoza";
import { EXPERIENCES } from "../../data/experiences";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
        `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);

// ── Both recordings are present and correctly identified ───────────────────
eq("two recordings", RECORDINGS.length, 2);
eq("the modern one is the id the team supplied",
   RECORDINGS.find(r => r.id === "modern")?.youTubeId, "7jYdtRTlvgQ");
eq("the older one is the id the team supplied",
   RECORDINGS.find(r => r.id === "older")?.youTubeId, "SSoAmPlEweY");
check("each links to its own video page",
      RECORDINGS.every(r => r.watchUrl.includes(r.youTubeId)));

// ── No audio may be taken offline without written permission ───────────────
eq("offline permission has not been obtained", OFFLINE_PERMISSION_OBTAINED, false);

// ── No credit is invented ──────────────────────────────────────────────────
eq("credits are not yet verified", metadataVerified, false);
check("no performer has been guessed", RECORDINGS.every(r => r.performer === null));
check("no channel has been guessed", RECORDINGS.every(r => r.channel === null));
check("no rights holder has been guessed", RECORDINGS.every(r => r.rightsHolder === null));
check("no publication date has been guessed", RECORDINGS.every(r => r.published === null));
check("no licence has been guessed", RECORDINGS.every(r => r.licence === null));

// ── Nothing claims the recordings as ours ──────────────────────────────────
const ownership = /\b(our recording|we recorded|4GeeksSake['’]s recording|performed by us)\b/i;
const prose = [HISTORY.short, HISTORY.full, HISTORY.railway, LANGUAGES.note,
               TRANSLATION.why, CREATIVE_PROMPT, ...COMPARISON.map(c => c.listenFor)].join(" ");
check("nothing presents a recording as ours", !ownership.test(prose));

// ── No translation ships until it is sourced and reviewed ──────────────────
eq("no line-by-line translation is shown", TRANSLATION.available, false);
eq("and none is carried in the data either", TRANSLATION.lines.length, 0);
check("the page explains why it is absent", TRANSLATION.why.length > 40);

// ── Cultural claims wait for a reviewer ────────────────────────────────────
eq("the languages have not been confirmed by a speaker", LANGUAGES.reviewedBy, null);
eq("the page has not been culturally reviewed", REVIEWED_BY, null);
check("the languages reported are named", LANGUAGES.reported.length >= 2);

// ── The history covers what it must, without romanticising it ──────────────
for (const topic of ["mine", "migrant", "compound", "railway", "call-and-response"]) {
  check(`the history covers ${topic}`, HISTORY.full.toLowerCase().includes(topic.toLowerCase()));
}
check("the history names the conditions rather than only the feeling",
      /badly paid|racially ordered|dangerous|not chosen/i.test(HISTORY.full));

// ── The comparison covers the four aspects asked for ───────────────────────
const aspects = COMPARISON.map(c => c.aspect.toLowerCase());
for (const want of ["rhythm", "instrumentation", "vocals", "emotional character"]) {
  check(`the comparison covers ${want}`, aspects.includes(want));
}

// ── The creative prompt is the one specified ───────────────────────────────
eq("the creative prompt", CREATIVE_PROMPT, "What does Shosholoza mean to you?");

// ── The journey moments exist, at the right ends of the line ───────────────
const byId = (id: string) => EXPERIENCES.find(x => x.id === id);
const opening = byId("shosholoza-opening");
const ret = byId("shosholoza-return");
const compare = byId("shosholoza-compare");
const verse = byId("shosholoza-verse");

check("the song opens the journey", opening !== undefined && opening.fromKm === 0);
check("the opening moment is anchored at Pretoria", opening?.stopId === "pretoria");
check("the song returns near Cape Town", ret !== undefined && ret.toKm >= 1560);
check("the return moment is anchored at Cape Town", ret?.stopId === "cape-town");
check("the two moments do not overlap",
      opening !== undefined && ret !== undefined && opening.toKm < ret.fromKm);

check("there is a learning comparison exercise",
      compare !== undefined && compare.mode === "adventure" && compare.activity?.kind === "question");
check("its reflection question is the one specified",
      compare?.activity?.kind === "question" &&
      /hardship, solidarity, movement and celebration/.test(compare.activity.prompt));
check("there is a creative activity",
      verse !== undefined && verse.mode === "creative" && verse.activity?.kind === "write");

// ── The ride never embeds a player; it routes to the credited page ─────────
for (const id of ["shosholoza-opening", "shosholoza-return"]) {
  const x = byId(id);
  check(`${id} sends the passenger to the song page`,
        x?.activity?.kind === "listen" && x.activity.to === "/shosholoza");
}

// ── No lyrics anywhere in what we wrote ────────────────────────────────────
// The app may name the song and translate the single word it is named after;
// it may not carry verses. These are the openings of the best-known lines, and
// finding one in our own prose means somebody has started transcribing.
const LYRIC_OPENINGS = ["kulezo ntaba", "stimela siphume", "wen' uyabaleka", "wena uyabaleka"];
const ourProse = [prose, opening?.story ?? "", ret?.story ?? "", compare?.story ?? "",
                  verse?.story ?? ""].join(" ").toLowerCase();
for (const line of LYRIC_OPENINGS) {
  check(`no lyric line: "${line}"`, !ourProse.includes(line));
}
check("the creative prompt asks for the passenger's own words",
      /your own words/i.test(verse?.story ?? ""));

// ── Every new entry is honest about review status ──────────────────────────
for (const id of ["shosholoza-opening", "shosholoza-compare", "shosholoza-verse", "shosholoza-return"]) {
  eq(`${id} is not yet reviewed`, byId(id)?.reviewedBy, null);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
if (failures) throw new Error(`${failures} assertion(s) failed`);
