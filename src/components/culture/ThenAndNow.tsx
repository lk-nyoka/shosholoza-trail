import { useEffect, useState } from "react";
import { Play, ExternalLink, WifiOff, X } from "lucide-react";
import {
  COMPARISON,
  CREATIVE_PROMPT,
  HISTORY,
  LANGUAGES,
  OFFLINE_NOTICE,
  OFFLINE_PERMISSION_OBTAINED,
  RECORDINGS,
  REVIEWED_BY,
  RIGHTS_NOTICE,
  SOURCE,
  TRANSLATION,
  type Recording,
} from "../../data/shosholoza";
import { savedWork, saveWork } from "../../lib/experienceEngine";
import "./ThenAndNow.css";

/**
 * Shosholoza: Then and Now.
 *
 * Two recordings of the same song, far apart in time, presented as two
 * perspectives rather than as background music.
 *
 * Three rules are enforced here rather than trusted to whoever edits the page:
 *
 *   1. Nothing plays until the passenger presses Play. The embed is not on the
 *      page at all until then — no iframe, no request to YouTube, no cookie.
 *      That satisfies the no-autoplay requirement and means a passenger who
 *      never presses Play never touches a third party.
 *   2. No audio is downloaded, cached or packaged. These recordings belong to
 *      their performers; a link is not a licence. If the app is offline the
 *      Play buttons say so instead of failing.
 *   3. No credit is invented. Every unverified field renders as "Not yet
 *      verified" with a link to the video page, because a wrong attribution on
 *      somebody's cultural work is worse than an honest gap.
 */

const NOT_VERIFIED = "Not yet verified";

function Credit({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="tan-credit">
      <dt>{label}</dt>
      <dd className={value ? undefined : "tan-credit--unknown"}>{value ?? NOT_VERIFIED}</dd>
    </div>
  );
}

function Player({ recording, online }: { recording: Recording; online: boolean }) {
  const [playing, setPlaying] = useState(false);

  // Leaving the page takes the embed with it: no player keeps running in the
  // background, and nothing about the recording is retained.
  useEffect(() => () => setPlaying(false), []);

  const heading = recording.title ?? recording.label;

  return (
    <article className="tan-player" aria-labelledby={`tan-${recording.id}`}>
      <h3 id={`tan-${recording.id}`} className="tan-player__title">{recording.label}</h3>
      <p className="tan-player__why">{recording.whyIncluded}</p>

      <div className="tan-player__stage">
        {playing ? (
          <>
            <iframe
              className="tan-player__frame"
              /* youtube-nocookie, and only ever after a tap. `rel=0` keeps the
                 end screen to the same channel rather than sending a passenger
                 off into unrelated recommendations. No autoplay parameter. */
              src={`https://www.youtube-nocookie.com/embed/${recording.youTubeId}?rel=0&modestbranding=1`}
              title={`${recording.label} of Shosholoza, playing on YouTube`}
              allow="encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
            />
            <button
              type="button"
              className="tan-player__stop"
              onClick={() => setPlaying(false)}
            >
              <X size={14} aria-hidden="true" /> Close the player
            </button>
          </>
        ) : online ? (
          <button
            type="button"
            className="tan-player__play"
            onClick={() => setPlaying(true)}
          >
            <span className="tan-player__playicon" aria-hidden="true"><Play size={20} fill="currentColor" /></span>
            Listen to {recording.label.replace(/^The /, "the ")}
            <small>Plays on YouTube · nothing starts on its own</small>
          </button>
        ) : (
          <div className="tan-player__offline" role="status">
            <WifiOff size={18} aria-hidden="true" />
            <p>{OFFLINE_NOTICE}</p>
          </div>
        )}
      </div>

      <dl className="tan-credits">
        <Credit label="Title" value={recording.title} />
        <Credit label="Performer" value={recording.performer} />
        <Credit label="Channel" value={recording.channel} />
        <Credit label="Published" value={recording.published} />
        <Credit label="Rights holder" value={recording.rightsHolder} />
        <Credit label="Licence" value={recording.licence} />
      </dl>

      <a className="tan-player__link" href={recording.watchUrl} target="_blank" rel="noopener noreferrer">
        Open {heading} on YouTube for the full credits
        <ExternalLink size={13} aria-hidden="true" />
      </a>
    </article>
  );
}

export default function ThenAndNow() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false);
  const [reflection, setReflection] = useState(() => savedWork("shosholoza-meaning"));

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return (
    <section className="tan" aria-labelledby="tan-heading">
      <header className="tan__head">
        <p className="t-eyebrow">Then and now</p>
        <h2 id="tan-heading" className="t-heading t-heading--lg">
          The same song, a lifetime apart
        </h2>
        <p className="tan__lead">
          Two recordings of Shosholoza. Listen to both, then decide for yourself what
          changed and what you would still recognise anywhere.
        </p>
      </header>

      <div className="tan__players">
        {RECORDINGS.map(recording => (
          <Player key={recording.id} recording={recording} online={online} />
        ))}
      </div>

      {!OFFLINE_PERMISSION_OBTAINED && (
        <p className="tan__notice" role="note">
          {OFFLINE_NOTICE} {RIGHTS_NOTICE}
        </p>
      )}

      {/* ── Where the song comes from ──────────────────────────────────── */}
      <div className="tan-block">
        <h3 className="tan-block__title">Where the song comes from</h3>
        {HISTORY.full.split("\n\n").map((para, i) => (
          <p key={i} className="tan-block__body">{para}</p>
        ))}
        <p className="tan-block__body tan-block__body--rail">{HISTORY.railway}</p>
      </div>

      {/* ── Languages ──────────────────────────────────────────────────── */}
      <div className="tan-block">
        <h3 className="tan-block__title">The languages it is sung in</h3>
        <p className="tan-block__body">{LANGUAGES.note}</p>
        <ul className="tan-langs">
          {LANGUAGES.reported.map(language => <li key={language}>{language}</li>)}
        </ul>
        <p className="tan-review">
          {LANGUAGES.reviewedBy
            ? `Checked by ${LANGUAGES.reviewedBy}.`
            : "Reported, not yet confirmed by a language specialist."}
        </p>
      </div>

      {/* ── Translation, deliberately absent ───────────────────────────── */}
      <div className="tan-block tan-block--absent">
        <h3 className="tan-block__title">A line-by-line translation</h3>
        {TRANSLATION.available ? (
          <ol className="tan-translation">
            {TRANSLATION.lines.map((line, i) => (
              <li key={i}>
                <span lang="zu">{line.original}</span>
                <span className="tan-translation__en">{line.english}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="tan-block__body">{TRANSLATION.why}</p>
        )}
      </div>

      {/* ── What to listen for ─────────────────────────────────────────── */}
      <div className="tan-block">
        <h3 className="tan-block__title">What to listen for</h3>
        <p className="tan-block__body">
          These are questions rather than answers. Nobody has told you which recording
          is better, because that is not a thing we can tell you.
        </p>
        <dl className="tan-compare">
          {COMPARISON.map(item => (
            <div key={item.aspect} className="tan-compare__row">
              <dt>{item.aspect}</dt>
              <dd>{item.listenFor}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── The creative prompt ────────────────────────────────────────── */}
      <div className="tan-block tan-block--prompt">
        <h3 className="tan-block__title">{CREATIVE_PROMPT}</h3>
        <label className="tan-prompt__label" htmlFor="tan-reflection">
          Write as much or as little as you like.
        </label>
        <textarea
          id="tan-reflection"
          className="tan-prompt__input"
          rows={4}
          value={reflection}
          placeholder="Nobody else sees this."
          onChange={event => {
            setReflection(event.target.value);
            saveWork("shosholoza-meaning", event.target.value);
          }}
        />
        <p className="tan-prompt__note">
          Saved on this phone only. Not uploaded, not shared.
        </p>
      </div>

      <footer className="tan__foot">
        <p>{SOURCE.text}</p>
        <p>
          {REVIEWED_BY
            ? `This page was checked by ${REVIEWED_BY}.`
            : "Not yet checked by a cultural reviewer."}
        </p>
      </footer>
    </section>
  );
}
