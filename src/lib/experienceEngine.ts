/**
 * The engine: kilometre plus mode in, experience out.
 *
 * This is the part the business case calls the Dynamic Experience Engine, and
 * it is deliberately small. Everything it needs is already on the device, so it
 * works at 03:40 in the middle of the Karoo with no signal, which is the only
 * test that matters on this line.
 *
 * The demonstration is one gesture: stand still at one kilometre and change the
 * mode. Same place, different thing to do. Three tabs could not show that.
 */
import { EXPERIENCES, type Experience } from "../data/experiences";
import type { Mode } from "./modes";

const DONE_KEY = "st.experiences.done.v1";
const WORK_KEY = "st.experiences.work.v1";

/**
 * Everything the passenger's chosen modes offer at this kilometre.
 *
 * Modes are a multi-select now, so this takes the whole set: somebody who
 * ticked Adventure and Creative gets both, in the order of how close their
 * anchor is. Nobody has to keep switching to find out what they are missing.
 */
export function experiencesAt(km: number, modes: Mode[]): Experience[] {
  const on = new Set(modes);
  return EXPERIENCES
    .filter(x => on.has(x.mode) && km >= x.fromKm && km <= x.toKm)
    .sort((a, b) => midpoint(a, km) - midpoint(b, km));
}

const midpoint = (x: Experience, km: number) => Math.abs((x.fromKm + x.toKm) / 2 - km);

/** The one to surface, if any. */
export function activeExperience(km: number, modes: Mode[]): Experience | null {
  return experiencesAt(km, modes)[0] ?? null;
}

/**
 * Why this appeared, in words the passenger can check.
 *
 * "Education Mode · unlocked near Kimberley · available offline" is the sentence
 * that turns a card that just showed up into a system behaving predictably.
 */
export function triggerReason(x: Experience, stopName: string | null): string {
  const where = x.stopId && stopName ? `near ${stopName}` : `between ${x.fromKm} and ${x.toKm} km`;
  return `unlocked ${where} · works offline`;
}

// ── Progress, on the device ────────────────────────────────────────────────

export function completed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(DONE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function isComplete(id: string): boolean {
  return completed().includes(id);
}

export function markComplete(id: string): void {
  try {
    const all = completed();
    if (!all.includes(id)) window.localStorage.setItem(DONE_KEY, JSON.stringify([...all, id]));
  } catch {
    /* best effort */
  }
}

/** Stamps earned so far, in route order - the passport. */
export function stamps(): { id: string; name: string; km: number }[] {
  const done = new Set(completed());
  return EXPERIENCES
    .filter(x => x.stamp && done.has(x.id))
    .map(x => ({ id: x.stamp!.id, name: x.stamp!.name, km: Math.round((x.fromKm + x.toKm) / 2) }))
    .sort((a, b) => a.km - b.km);
}

/** How far through the corridor's experiences this passenger is. */
export function progress(modes?: Mode[]): { done: number; total: number } {
  const on = modes?.length ? new Set(modes) : null;
  const pool = on ? EXPERIENCES.filter(x => on.has(x.mode)) : EXPERIENCES;
  const done = new Set(completed());
  return { done: pool.filter(x => done.has(x.id)).length, total: pool.length };
}

/**
 * Points.
 *
 * A hundred a question, the way the design has it, and twenty for anything else
 * completed. Deliberately a personal number rather than a leaderboard: a board
 * ranking strangers on a train is a moderation and safety surface, and it turns
 * a journey into a competition nobody asked to enter.
 */
export const POINTS_PER_QUESTION = 100;
export const POINTS_PER_ACTIVITY = 20;

export function points(): number {
  const done = new Set(completed());
  return EXPERIENCES.filter(x => done.has(x.id)).reduce(
    (total, x) => total + (x.activity?.kind === "question" ? POINTS_PER_QUESTION : POINTS_PER_ACTIVITY),
    0,
  );
}

// ── What the passenger wrote ───────────────────────────────────────────────
// Stays here. Never uploaded, never shown to anyone else, so there is no
// moderation or copyright question to answer.

export function savedWork(id: string): string {
  try {
    return (JSON.parse(window.localStorage.getItem(WORK_KEY) ?? "{}") as Record<string, string>)[id] ?? "";
  } catch {
    return "";
  }
}

export function saveWork(id: string, text: string): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(WORK_KEY) ?? "{}") as Record<string, string>;
    all[id] = text;
    window.localStorage.setItem(WORK_KEY, JSON.stringify(all));
  } catch {
    /* best effort */
  }
}
