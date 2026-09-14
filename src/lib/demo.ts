/**
 * Demonstration mode.
 *
 * Four minutes on a stage is not the place to discover that the venue wifi is
 * saturated, that a judge's phone refused a location prompt, or that the train
 * happened to be in the middle of the Karoo with nothing to look at. Every one
 * of those has sunk a better product than this one.
 *
 * So: `?demo=1` pins the app to a prepared, deterministic state. It changes
 * nothing about what the app claims — every simulation label stays exactly
 * where it was, and a visible chip says DEMO so that nobody watching can
 * mistake a rehearsed run for a live one. It only removes the ways a
 * demonstration can fail for reasons that have nothing to do with the work.
 *
 *   ?demo=1   turn it on (remembered for the tab, so navigation keeps it)
 *   ?demo=0   turn it off
 *
 * It is deliberately a URL parameter rather than a build flag: the deployed
 * build the judges can open afterwards is the same build that was presented.
 */

const KEY = "st.demo.v1";

function readFlag(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get("demo");
    if (param === "1" || param === "true") {
      window.sessionStorage.setItem(KEY, "1");
      return true;
    }
    if (param === "0" || param === "false") {
      window.sessionStorage.removeItem(KEY);
      return false;
    }
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Resolved once, at startup. A mode that could flip halfway through a
 * presentation would be worse than no mode at all.
 */
export const DEMO = typeof window === "undefined" ? false : readFlag();

/**
 * Where the ride begins in demo mode.
 *
 * 1 246 km: the run down into Matjiesfontein, with the Hex River mountains
 * ahead and a station worth arriving at eighteen kilometres away. Starting at
 * Pretoria means the first thing an audience sees is a suburb.
 */
export const DEMO_START_KM = 1246;

/** Slow enough to talk over, fast enough that the platform arrives on cue. */
export const DEMO_SPEED = 8;

/**
 * A fixed position for the live page, so it never asks a judge's phone for its
 * location and never shows a blank map because the fix has not arrived.
 */
export const DEMO_POSITION = { km: 1258.4, lat: -33.2311, lon: 20.6702 };

/** The one prepared question, so the guide answers instantly and identically. */
export const DEMO_QUESTION = "How long do I have at Matjiesfontein?";
