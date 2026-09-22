import { BookOpen, PenLine, Users } from "lucide-react";
import { MODES, type Mode } from "../../lib/modes";
import "./ModeSwitch.css";

const ICON = { adventure: BookOpen, creative: PenLine, networking: Users } as const;

/**
 * Which modes are on, as a set.
 *
 * The modes are chosen before boarding now, so this is not where the decision
 * gets made - it is the quick way to quieten one without leaving the journey.
 * Turning the last one off is allowed: "just travelling" is a legitimate way to
 * ride a train, and an app that will not let you stop being sold things is not
 * one people keep.
 */
export default function ModeSwitch({
  modes, onChange, compact,
}: {
  modes: Mode[];
  onChange: (modes: Mode[]) => void;
  compact?: boolean;
}) {
  const toggle = (id: Mode) =>
    onChange(modes.includes(id) ? modes.filter(m => m !== id) : [...modes, id]);

  return (
    <div className={compact ? "modesw modesw--compact" : "modesw"} role="group" aria-label="Journey modes">
      {MODES.map(entry => {
        const Icon = ICON[entry.id];
        const on = modes.includes(entry.id);
        return (
          <button
            key={entry.id}
            className={on ? "modesw__btn modesw__btn--on" : "modesw__btn"}
            onClick={() => toggle(entry.id)}
            aria-pressed={on}
            title={entry.blurb}
          >
            <Icon size={13} aria-hidden="true" />
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}
