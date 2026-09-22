/**
 * useTimetable — fetches GTFS-style timetable from /api/v1/timetable
 * and provides helper to find the next upcoming stop from the current km.
 */
import { useEffect, useState } from "react";
import { apiConfigured } from "../api";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

export interface TimetableEntry {
  stop_id:   string;
  stop_name: string;
  km:        number;
  departs?:  string;
  arrives?:  string;
  platform:  string;
  zone:      string;
}

interface TimetableResponse {
  calls: TimetableEntry[];
}

export function useTimetable() {
  const [entries, setEntries]   = useState<TimetableEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);

  useEffect(() => {
    // No journey service in this build: say so without a request that is
    // already known to come back 503.
    if (!apiConfigured) {
      setError("Timetable unavailable — this build runs without a journey service.");
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    fetch(`${API_BASE}/timetable`, { signal: ctrl.signal, headers: { Accept: "application/json" } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TimetableEntry[] | TimetableResponse>;
      })
      .then(data => {
        setEntries(Array.isArray(data) ? data : data.calls);
        setLoading(false);
      })
      .catch(err => {
        if ((err as Error).name !== "AbortError") {
          setError("Timetable unavailable — live schedule data is offline.");
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, []);

  /** Next stop at or after the given km. */
  const nextEntry = (km: number): TimetableEntry | null =>
    entries.find(e => e.km >= km) ?? entries[entries.length - 1] ?? null;

  return { entries, loading, error, nextEntry };
}
