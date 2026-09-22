/**
 * The three journey modes.
 *
 * Named and shaped to match the team's design: they are chosen once, before
 * boarding, and more than one can be on at a time. That multi-select is the
 * right call and it changes the engine's job — the question is no longer "which
 * mode am I in" but "which of the things at this kilometre did this passenger
 * ask to see".
 *
 * They are still one engine over one set of location-triggered experiences, not
 * three separate sections. That is what makes the same kilometre able to give a
 * school group the geology and a founder the room full of builders.
 */

export type Mode = "adventure" | "creative" | "networking";

const KEY = "st.modes.v2";

export const MODES: {
  id: Mode;
  label: string;
  blurb: string;
  /** The tab this mode's content lives under, matching the bottom bar. */
  home: "explore" | "create" | "connect";
}[] = [
  {
    id: "adventure",
    label: "Adventure",
    blurb: "Stories, quizzes and challenges along the line.",
    home: "explore",
  },
  {
    id: "creative",
    label: "Creative",
    blurb: "Photos and reflections as the country goes past.",
    home: "create",
  },
  {
    id: "networking",
    label: "Networking",
    blurb: "Fellow travellers and local experiences.",
    home: "connect",
  },
];

export const MODE_LABEL: Record<Mode, string> = {
  adventure: "Adventure",
  creative: "Creative",
  networking: "Networking",
};

const ALL: Mode[] = MODES.map(m => m.id);
const isMode = (value: string): value is Mode => ALL.includes(value as Mode);

/**
 * Which modes this passenger turned on. All three by default: somebody who has
 * not chosen yet should see what the app can do, not an empty journey.
 */
export function savedModes(): Mode[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [...ALL];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...ALL];
    // An empty array is intentional: "just travelling" is a valid choice.
    return parsed.filter((value): value is Mode => typeof value === "string" && isMode(value));
  } catch {
    return [...ALL];
  }
}

export function saveModes(modes: Mode[]): void {
  try {
    // Preserve [] rather than silently converting it back to every mode.
    window.localStorage.setItem(KEY, JSON.stringify(modes));
  } catch {
    /* the choice still applies for this session */
  }
}

/** Has the passenger actually been asked yet? Drives the onboarding step. */
export function modesChosen(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
