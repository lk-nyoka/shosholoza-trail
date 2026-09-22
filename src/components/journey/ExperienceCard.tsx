import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check, Eye, Music, PenLine, Users } from "lucide-react";
import type { Experience } from "../../data/experiences";
import {
  isComplete, markComplete, saveWork, savedWork, triggerReason,
} from "../../lib/experienceEngine";
import { MODE_LABEL } from "../../lib/modes";
import "./ExperienceCard.css";

/**
 * One location-triggered experience.
 *
 * The header always says why this appeared - which mode, which place, and that
 * it works offline. A card that just materialises over the view looks like an
 * advert; a card that explains its own trigger looks like a system.
 *
 * Every mode renders through this one component on purpose. They are not three
 * features, they are one engine with three kinds of content, and the code
 * should look like that or the claim is not true.
 */
export default function ExperienceCard({
  experience, stopName, onClose,
}: {
  experience: Experience;
  stopName: string | null;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState(() => savedWork(experience.id));
  const [done, setDone] = useState(() => isComplete(experience.id));

  const finish = () => {
    markComplete(experience.id);
    setDone(true);
  };

  const Icon =
    experience.mode === "adventure" ? BookOpen : experience.mode === "creative" ? PenLine : Users;

  return (
    <aside className={`xp xp--${experience.mode}`} aria-label={experience.title}>
      <header className="xp__head">
        <span className="xp__badge">
          <Icon size={11} aria-hidden="true" />
          {MODE_LABEL[experience.mode]}
        </span>
        <span className="xp__why">{triggerReason(experience, stopName)}</span>
        <button className="xp__close" onClick={onClose} aria-label="Dismiss">×</button>
      </header>

      <h2 className="xp__title">{experience.title}</h2>
      <p className="xp__summary">{experience.summary}</p>

      {experience.story && (
        <>
          {open && <p className="xp__story">{experience.story}</p>}
          <button className="xp__more" onClick={() => setOpen(v => !v)}>
            {open ? "Less" : `Read the rest · ${experience.minutes} min`}
          </button>
        </>
      )}

      {experience.matters && open && (
        <p className="xp__matters"><b>Why it matters.</b> {experience.matters}</p>
      )}

      {/* ── The activity ─────────────────────────────────────────────── */}
      {experience.activity?.kind === "question" && (
        <div className="xp__quiz">
          <p className="xp__prompt">{experience.activity.prompt}</p>
          {experience.activity.options.map((option, index) => {
            const chosen = picked === index;
            const correct = index === (experience.activity as { answer: number }).answer;
            return (
              <button
                key={option}
                className={[
                  "xp__option",
                  picked === null ? "" : correct ? "xp__option--right" : chosen ? "xp__option--wrong" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => { if (picked === null) { setPicked(index); if (correct) finish(); } }}
                disabled={picked !== null}
              >
                {option}
              </button>
            );
          })}
          {picked !== null && (
            <p className="xp__because">{(experience.activity as { because: string }).because}</p>
          )}
        </div>
      )}

      {experience.activity?.kind === "look" && (
        <div className="xp__look">
          <p className="xp__prompt"><Eye size={13} aria-hidden="true" /> {experience.activity.prompt}</p>
          {!done && <button className="xp__do" onClick={finish}>I found it</button>}
        </div>
      )}

      {experience.activity?.kind === "write" && (
        <div className="xp__write">
          <label className="xp__prompt" htmlFor={`xp-${experience.id}`}>
            {experience.activity.prompt}
          </label>
          <textarea
            id={`xp-${experience.id}`}
            rows={experience.activity.lines + 1}
            value={text}
            onChange={event => { setText(event.target.value); saveWork(experience.id, event.target.value); }}
            placeholder="Nobody else sees this."
          />
          {!done && text.trim().length > 8 && (
            <button className="xp__do" onClick={finish}>Keep it</button>
          )}
          <p className="xp__private">Saved on this phone only. Not uploaded, not shared.</p>
        </div>
      )}

      {experience.activity?.kind === "listen" && (
        <div className="xp__listen">
          <p className="xp__prompt">{experience.activity.prompt}</p>
          {/* A link, not a player. The recordings belong to other people, they are
              not in the offline download, and they belong beside their credits
              rather than floating over the ride. Nothing plays until it is tapped. */}
          <Link className="xp__do xp__do--listen" to={experience.activity.to} onClick={finish}>
            <Music size={15} aria-hidden="true" /> {experience.activity.cta}
          </Link>
          <p className="xp__private">
            Plays from YouTube on the song page, with the full credits. Needs a
            connection — it is not part of the offline download.
          </p>
        </div>
      )}

      {experience.activity?.kind === "room" && (
        <div className="xp__room">
          <p className="xp__prompt">{experience.activity.blurb}</p>
          {!done ? (
            <button className="xp__do" onClick={finish}>Join this room</button>
          ) : (
            <p className="xp__joined">You are in. Your name and number stay private — you meet in person or not at all.</p>
          )}
          <p className="xp__private">
            <b>Demonstration.</b> Rooms need a server, so nobody else is in this one yet.
            The consent model — topic not identity, expires with the journey — is the real part.
          </p>
        </div>
      )}

      {/* ── Provenance ───────────────────────────────────────────────── */}
      <footer className="xp__foot">
        {done && experience.stamp && (
          <span className="xp__stamp"><Check size={11} aria-hidden="true" /> {experience.stamp.name}</span>
        )}
        {experience.source && (
          <span className="xp__source">
            Source: {experience.source.url
              ? <a href={experience.source.url} target="_blank" rel="noopener noreferrer">{experience.source.text}</a>
              : experience.source.text}
          </span>
        )}
        <span className="xp__review">
          {experience.reviewedBy
            ? `Checked by ${experience.reviewedBy}`
            : "Not yet checked by a subject reviewer"}
        </span>
      </footer>
    </aside>
  );
}
