import { useState } from "react";
import { Link } from "react-router-dom";
import OfflineJourney from "../components/ui/OfflineJourney";
import { CALLS, CALL_DAYS, JOURNEY_DURATION_WORDS, TIMETABLE_NOTICE } from "../lib/corridor";
import "./Help.css";
import InterestForm from "../components/ui/InterestForm";
import { DATA_VERSION, RESET_CONFIRM, RESET_DESCRIPTION, resetOfflineData } from "../lib/appUpdate";

/**
 * The practical page.
 *
 * Everything else in this app is about what you pass. This is about the things
 * a passenger actually worries about before boarding a 27-hour train: whether
 * it is even running, what it costs, whether there is food, what happens at
 * night. The figures are as published and are dated, because they change.
 */

interface Answer { q: string; a: React.ReactNode; }

const ANSWERS: Answer[] = [
  {
    q: "Is the train actually running?",
    a: <>
      This service was suspended in 2020 and returned on a reduced basis — a weekly
      Cape Town–Johannesburg working resumed in December 2023. Before you plan around it,
      check the current position with the operator: services on this corridor have changed
      several times. Treat every time on this page as the published schedule, not a promise.
    </>,
  },
  {
    q: "How long does it take?",
    a: <>The published schedule is {JOURNEY_DURATION_WORDS} — 08:30 out of Pretoria, into Cape
      Town at 12:40 the next day, through the Karoo overnight. Plan for longer. Delays
      of several hours are ordinary rather than exceptional on this line — long stands at
      stations, crew changes, freight given the road ahead of you. Nobody misses a connection
      because the train was early.</>,
  },
  {
    q: "So should I trust the times in this app?",
    a: <>Treat them as the schedule, not as what is happening. This app has no live feed from the
      operator, so it can only show you what is published. On board, the conductor's
      announcement is the real information — which is why the stop pages ask you to set how long
      the train is standing rather than assuming it.</>,
  },
  {
    q: "What does it cost?",
    a: <>Tourist class with a sleeper berth has been published at about R690 per person,
      with bedding — sheets, blanket and pillow — around R60 extra. Prices change; confirm
      when you book.</>,
  },
  {
    q: "What is the sleeping like?",
    a: <>Two-berth coupés and four-berth compartments, each with a washbasin and hot and cold
      water. Showers are shared, at the end of the corridor. Bedding is issued separately, so
      take a warm layer if you are travelling in winter — the Karoo gets very cold at night.</>,
  },
  {
    q: "Is there food on board?",
    a: <>There is a restaurant car serving snacks, drinks and full meals at modest prices.
      Many passengers still bring their own water and something to eat, because the stops are
      long and the queues at meal times are longer.</>,
  },
  {
    q: "How much luggage can I take?",
    a: <>Up to about 25 kg into your sleeper compartment. Anything you need overnight should be
      in a small bag you can reach from your berth.</>,
  },
  {
    q: "How far ahead should I book?",
    a: <>Booking opens about 90 days ahead and sleepers go early — often a month or two before
      departure, especially over holidays.</>,
  },
  {
    q: "Can I get off at the stops?",
    a: <>At most of them, yes, but how long the train stands varies and is announced on board.
      This app works out what you can reach from the platform — set the stop time you were
      given and it will tell you what is walkable and what is not. When in doubt, stay within
      sight of your coach.</>,
  },
  {
    q: "Will my phone work?",
    a: <>Not reliably. There are long stretches — the worst is between De Aar and Beaufort
      West — with no usable signal at all. Download the journey before you board and everything
      here keeps working without a connection.</>,
  },
  {
    q: "Is it safe?",
    a: <>Ordinary travel sense applies: keep your compartment locked at night, keep valuables
      out of sight, and keep documents on you rather than in stored luggage. Staff travel the
      full route and there is a conductor on every coach.</>,
  },
  {
    q: "What about children?",
    a: <>The train suits children well — there is room to move, and the windows do the
      entertaining. Family groups usually take a four-berth compartment. This app has no
      accounts, no messaging and no way for anyone to see where a passenger is.</>,
  },
];

export default function Help() {
  const [resetting, setResetting] = useState(false);
  const [resetNote, setResetNote] = useState<string | null>(null);

  /**
   * Clear the downloaded route and nothing else.
   *
   * `window.confirm` rather than a custom dialog: this is destructive, it is
   * rare, and the browser's own confirmation is the one every passenger
   * already recognises. The wording names exactly what goes and what stays.
   */
  const handleReset = async () => {
    if (typeof window !== "undefined" && !window.confirm(RESET_CONFIRM)) return;
    setResetting(true);
    setResetNote(null);
    try {
      const result = await resetOfflineData(
        typeof caches !== "undefined" ? caches : null,
        typeof window !== "undefined" ? window.localStorage : null,
      );
      setResetNote(
        result.caches.length === 0
          ? "There was nothing stored to clear."
          : `Cleared ${result.caches.length} stored ${result.caches.length === 1 ? "set" : "sets"} of route data. Download it again from the Offline section above.`,
      );
    } catch {
      setResetNote("This browser would not let the app clear its stored data.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="help-page">
      <div className="container">
        <header className="section help-header">
          <p className="t-eyebrow">Before you board</p>
          <h1 className="t-display t-display--lg help-header__heading">
            The practical{" "}<br />questions.
          </h1>
          <p className="t-body help-header__sub">
            What a 27-hour train actually asks of you — and what this app does when the
            signal disappears.
          </p>
        </header>

        <section className="help-section" aria-labelledby="offline">
          <h2 id="offline" className="t-heading t-heading--lg">Offline</h2>
          <OfflineJourney />
        </section>

        <section className="help-section" aria-labelledby="timetable">
          <h2 id="timetable" className="t-heading t-heading--lg">The published schedule</h2>
          <p className="help-notice" role="note">{TIMETABLE_NOTICE}</p>
          <p className="help-note">
            Southbound, Pretoria to Cape Town. Scheduled times only — this app does not receive
            live running information from the operator. The train calls at more places than the
            eight this app writes about: Klerksdorp, Wellington and Bellville are working stops
            with no editorial page, and they are in the table because your train stops there.
          </p>
          <div className="help-table-wrap">
            <table className="help-table">
              <thead>
                <tr><th scope="col">Station</th><th scope="col">Time</th><th scope="col">Day</th></tr>
              </thead>
              <tbody>
                {CALLS.map((call, i) => (
                  <tr key={call.name} className={call.stopId ? "help-table__stop" : ""}>
                    <th scope="row">{call.name}</th>
                    <td>{call.time}{call.kind === "arrival" ? " arr" : ""}</td>
                    <td>{CALL_DAYS[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/*
          * Which build is on this phone, and how to start the download again.
          *
          * The first question when somebody reports a problem is always
          * "which version are you on", and until now the only place that
          * appeared was the credits page. The reset is next to it because the
          * two go together: a passenger on an old build with a half-finished
          * download needs both answers in one place.
          */}
        <section className="help-section" aria-labelledby="version">
          <h2 id="version" className="t-heading t-heading--lg">This app</h2>
          <p className="help-note">
            Version <code>{__BUILD_ID__}</code>, offline data v{DATA_VERSION}.
            {" "}Quote the version if you report something that looks wrong.
          </p>
          <p className="help-note">{RESET_DESCRIPTION}</p>
          <button type="button" className="help-reset" onClick={handleReset} disabled={resetting}>
            {resetting ? "Clearing…" : "Reset offline data"}
          </button>
          {resetNote && (
            <p className="help-note help-reset__note" role="status">{resetNote}</p>
          )}
        </section>

        <section className="help-section" aria-labelledby="questions">
          <h2 id="questions" className="t-heading t-heading--lg">Questions</h2>
          <div className="help-answers">
            {ANSWERS.map(item => (
              <details key={item.q} className="help-answer">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <InterestForm source="help" />

        <p className="help-source">
          Schedule, fares and on-board details as published by the operator and compiled by{" "}
          <a href="https://www.seat61.com/SouthAfrica.htm" target="_blank" rel="noopener noreferrer">
            seat61.com
          </a>, checked September 2026. Confirm before you travel.{" "}
          <Link to="/privacy">How we handle your data</Link>.
        </p>
      </div>
    </div>
  );
}
