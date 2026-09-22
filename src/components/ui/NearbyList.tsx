import { useMemo, useState } from "react";
import type React from "react";
import { Footprints } from "lucide-react";
import {
  distanceFrom, distanceLabel, GROUP_LABEL, groupOf, KIND_LABEL, NEARBY,
  type NearbyGroup,
} from "../../data/nearby";
import { REACH_LABEL, reachOf } from "../../lib/corridor";
import type { Stop } from "../../types";
import "./NearbyList.css";

interface Props {
  stop: Stop;
  stopMinutes: number;
  unlimited?: boolean;
  /** The page's search box applies here too: one box, one page, one result. */
  query?: string;
}

const GROUPS: NearbyGroup[] = ["food", "shops", "essentials", "heritage"];

/**
 * Everything else within walking distance, ordered by how far it is and marked
 * by whether the train will still be there when you get back. No photographs
 * and no ratings: these are other people's businesses as mapped in
 * OpenStreetMap, and dressing them up would be inventing things about them.
 */
export default function NearbyList({ stop, stopMinutes, unlimited, query = "" }: Props) {
  const [group, setGroup] = useState<NearbyGroup | "all">("all");

  const rows = useMemo(() => {
    const entries = NEARBY[stop.id] ?? [];
    return entries
      .map(place => {
        const km = distanceFrom(place, stop.lat, stop.lon);
        const label = distanceLabel(km);
        const measured = reachOf(label, stopMinutes);
        return {
          place,
          km,
          label,
          group: groupOf(place.k),
          reach: unlimited
            ? (measured.reach === "platform" ? "platform" as const : "comfortable" as const)
            : measured.reach,
          walk: measured.walk,
        };
      })
      .filter(r => Number.isFinite(r.km))
      .sort((a, b) => a.km - b.km);
  }, [stop.id, stop.lat, stop.lon, stopMinutes, unlimited]);

  if (rows.length === 0) return null;

  const needle = query.trim().toLowerCase();
  const searched = needle
    ? rows.filter(r =>
        r.place.n.toLowerCase().includes(needle) ||
        KIND_LABEL[r.place.k].toLowerCase().includes(needle) ||
        (r.place.c ?? "").toLowerCase().includes(needle))
    : rows;
  const shown = group === "all" ? searched : searched.filter(r => r.group === group);
  const reachable = rows.filter(r => r.reach === "platform" || r.reach === "comfortable").length;
  const available = GROUPS.filter(g => rows.some(r => r.group === g));

  return (
    <section className="nearby" aria-labelledby="nearby-title">
      <header className="nearby__head">
        <div>
          <h2 id="nearby-title" className="t-heading t-heading--lg">Near the platform</h2>
          <p className="nearby__sub">
            {needle ? `${shown.length} of ${rows.length}` : rows.length} mapped places around {stop.name}
            {unlimited
              ? " — this is your own stop, so take your time."
              : ` · ${reachable} you could reach and return from in ${stopMinutes} minutes.`}
          </p>
        </div>
      </header>

      <div className="nearby__filters" role="group" aria-label="Filter by kind">
        <button
          className={["nearby__filter", group === "all" ? "active" : ""].filter(Boolean).join(" ")}
          onClick={() => setGroup("all")} aria-pressed={group === "all"} type="button"
        >
          Everything
        </button>
        {available.map(g => (
          <button
            key={g}
            className={["nearby__filter", group === g ? "active" : ""].filter(Boolean).join(" ")}
            onClick={() => setGroup(g)} aria-pressed={group === g} type="button"
          >
            {GROUP_LABEL[g]}
          </button>
        ))}
      </div>

      {needle && shown.length === 0 && (
        <p className="nearby__empty">Nothing mapped near {stop.name} matches "{query.trim()}".</p>
      )}

      <ul className="nearby__list reveal" key={`${stop.id}-${group}-${needle}`}>
        {shown.map((row, i) => (
          <li
            key={row.place.n}
            className={`nearby__row nearby__row--${row.reach}`}
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className="nearby__name">
              <b>{row.place.n}</b>
              <small>
                {KIND_LABEL[row.place.k]}
                {row.place.c ? ` · ${row.place.c.split(";")[0].replace(/_/g, " ")}` : ""}
              </small>
            </span>
            <span className="nearby__walk">
              <Footprints size={11} aria-hidden="true" />
              {row.walk} min · {row.label}
            </span>
            <span className="nearby__reach">{REACH_LABEL[row.reach]}</span>
          </li>
        ))}
      </ul>

      <p className="nearby__source">
        Mapped places from OpenStreetMap contributors, ODbL 1.0. Opening hours vary and are not
        shown — a small-town shop at 03:40 will be closed.
      </p>
    </section>
  );
}
