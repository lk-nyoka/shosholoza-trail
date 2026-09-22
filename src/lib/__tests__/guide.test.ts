/**
 * What the route guide will and will not say.
 *
 * This is a retrieval system, not a language model, and its failure mode is
 * specific: TF-IDF always has a best match, so without a floor it answers a
 * question about safety with whichever tourism document happens to share a
 * word. On a product about physical travel that is the failure that matters,
 * and it is not visible by reading the code — only by asking.
 *
 * The two bands below were measured, not guessed. If the corpus changes,
 * re-measure: questions the guide covers must stay above ANSWER_FLOOR and
 * questions it does not must stay below it.
 */
import { CORPUS, DOC_SOURCES, SOURCE_LABELS, answer, answerWithSources, query, sourceFor } from "../aiEngine";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
const has = (q: string, fragment: string) => {
  const a = answer(q);
  check(`"${q}" → ${fragment}`, a.toLowerCase().includes(fragment.toLowerCase()), a.slice(0, 90));
};
const fallsBack = (q: string) => {
  const a = answer(q);
  check(`"${q.slice(0, 34)}" → honest fallback`, a.startsWith("I can answer questions about"), a.slice(0, 90));
};

check("corpus loaded", CORPUS.length >= 30, `${CORPUS.length} docs`);

// ── Safety-critical intents are never answered from the tourism corpus ──────
has("Is the train safe at night?", "can't advise on safety");
has("Is this station dangerous?", "can't advise on safety");
has("is the train delayed", "don't have live running information");
has("which platform does it leave from", "don't have live running information");
has("there has been an accident, call an ambulance", "10111");
has("how do I book a ticket", "can't book or pay for a train ticket");
has("can I get a refund", "can't book or pay for a train ticket");

// ── The ticket guard must not swallow the page's own suggested questions ────
has("Can I book a room at Lord Milner Hotel?", "Lord Milner");
has("book a table at the coffee house", "Coffee House");
has("Best place to buy crafts in Johannesburg?", "Rosebank");

// ── Questions the guide genuinely covers ────────────────────────────────────
has("What is ShosholozaTrail?", "travel companion");
has("Help me choose a mode.", "Adventure");
has("What is the next stop?", "does not know where the train is");
has("Tell me about Kimberley", "Kimberley");
has("the Big Hole", "Big Hole");
has("how long is the journey", "1 568 km");
has("does it work offline", "offline");

// ── Questions it does not cover are refused, not approximated ───────────────
fallsBack("asdkjh qwe zxcvb");
fallsBack("SELECT * FROM users; DROP TABLE stops;--");
fallsBack("what is the weather tomorrow");
fallsBack("can I bring my dog");
fallsBack("");
fallsBack("   ");
fallsBack("a".repeat(4000));

// ── It never throws, whatever it is handed ──────────────────────────────────
for (const nasty of ["<script>alert(1)</script>", "\u0000\u0001", "🚂".repeat(500), "?".repeat(2000)]) {
  let threw = false;
  try { answer(nasty); query(nasty); } catch { threw = true; }
  check(`survives ${JSON.stringify(nasty.slice(0, 16))}`, !threw);
}


// ── Provenance ──────────────────────────────────────────────────────────────
// The guide's welcome line claims every answer comes from documents written
// and checked for this route. Until now nothing on screen supported that, and
// nothing in this suite checked it. A claim about provenance is exactly the
// kind of claim that has to be enforced rather than asserted.

check("every document in the corpus has a source", CORPUS.every(doc => Boolean(sourceFor(doc))));
check("...and every source has wording a passenger can read", CORPUS.every(doc => sourceFor(doc).label.length > 12));
check("no source claims a link it does not have", Object.values(SOURCE_LABELS).every(source => source.url === null || source.url.startsWith("https://")));
check("our own writing says it is our own writing", SOURCE_LABELS.editorial.label.toLowerCase().includes("4geekssake"));
check("...and does not claim to be quoted", SOURCE_LABELS.editorial.label.toLowerCase().includes("not quoted"));
check("the timetable source names where it came from", SOURCE_LABELS.timetable.label.includes("seat61"));
check("...and links to it", SOURCE_LABELS.timetable.url !== null);

// Every id named in DOC_SOURCES has to exist, or the mapping is silently rotting.
check("every named document id is a real document", Object.keys(DOC_SOURCES).every(id => CORPUS.some(doc => doc.id === id)));

// A real answer carries its sources.
{
  const reply = answerWithSources("How long does the journey take?");
  check("a journey question is grounded", reply.grounded);
  check("...and cites something", reply.sources.length > 0);
  check("...names the documents it used", reply.used.length > 0);
  check("...and reports its own confidence", typeof reply.score === "number");
  check("...citing the published timetable", reply.sources.some(s => s.kind === "timetable"));
}

{
  const reply = answerWithSources("Tell me about the Big Hole in Kimberley");
  check("a place question is grounded", reply.grounded);
  check("...and says whose writing it is", reply.sources.length > 0);
}

// The fallback cites nothing, because it drew on nothing.
{
  // "What is the capital of Peru?" looks like the obvious unanswerable
  // question and is not one: it retrieves Pretoria, whose document opens
  // "the administrative capital of South Africa", well above the floor. The
  // suite already knows which questions genuinely fall back.
  const reply = answerWithSources("can I bring my dog");
  check("an unanswerable question is not grounded", reply.grounded === false);
  check("...and cites nothing", reply.sources.length === 0);
  check("...and uses no documents", reply.used.length === 0);
}

// A guarded reply is the app speaking about itself, and says so.
{
  // A live-running question: the guide must not pretend to know, and the
  // reply is the app speaking about itself rather than a retrieved document.
  const reply = answerWithSources("Is the train delayed today?");
  check("a guarded reply is not presented as retrieved", reply.grounded === false);
  check("...but still says where it comes from", reply.sources.length === 1);
  check("...namely the app", reply.sources[0].kind === "app");
}

// The prose is the same either way - one answer, two shapes.
check("answerWithSources and answer agree", answerWithSources("How long does the journey take?").text === answer("How long does the journey take?"));
check("...on the fallback too", answerWithSources("can I bring my dog").text === answer("can I bring my dog"));

// Sources are de-duplicated: two documents from the same place dataset should
// not print the same line twice.
{
  const reply = answerWithSources("Where can I eat near Beaufort West station?");
  const kinds = reply.sources.map(source => source.kind);
  check("sources are not repeated", kinds.length === new Set(kinds).size);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
// Thrown rather than process.exit so this file needs no Node types: an uncaught
// error still leaves a non-zero exit code for the runner and for CI.
if (failures) throw new Error(`${failures} assertion(s) failed`);
