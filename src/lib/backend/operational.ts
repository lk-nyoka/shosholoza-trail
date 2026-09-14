/**
 * Service status and alerts — the only data in this app that can hurt someone.
 *
 * Everything else here degrades gracefully when it goes stale: an old photo of
 * Matjiesfontein is still a photo of Matjiesfontein. An eight-hour-old "running
 * on time" is not still true, and showing it as though it were is how an app
 * strands a passenger on a platform. So operational data carries the moment it
 * was fetched, and the moment it stops being worth believing, and the app is
 * expected to say "last checked at 09:14" rather than imply "now".
 *
 * Nothing here is authoritative yet. Until an operator is actually publishing
 * into this table, it will be empty, and empty is the honest answer.
 */
import { withBackend } from "./client";

const KEY = "st.operational.v1";

/** After this long without a refresh, we stop presenting it as current. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

export interface Alert {
  id: string;
  severity: "info" | "warning" | "severe";
  title: string;
  body: string;
  publishedAt: string;
}

export interface ServiceStatus {
  serviceDate: string;
  state: "scheduled" | "running" | "delayed" | "cancelled";
  note: string | null;
  updatedAt: string;
}

/** The row as it comes back from the database, before it is tidied up. */
interface AlertRow {
  id: string;
  severity: Alert["severity"];
  title: string;
  body: string;
  published_at: string;
}

export interface Operational {
  status: ServiceStatus | null;
  alerts: Alert[];
  /** When this device last heard from the backend. */
  fetchedAt: number;
}

export type Freshness = "live" | "stale" | "never";

export function freshnessOf(snapshot: Operational | null): Freshness {
  if (!snapshot) return "never";
  return Date.now() - snapshot.fetchedAt <= STALE_AFTER_MS ? "live" : "stale";
}

export function cached(): Operational | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Operational) : null;
  } catch {
    return null;
  }
}

function store(snapshot: Operational): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* best effort */
  }
}

export async function refresh(serviceId = "meyl-pta-cpt"): Promise<Operational | null> {
  const today = new Date().toISOString().slice(0, 10);

  return withBackend(async db => {
    const [statusResult, alertsResult] = await Promise.all([
      db
        .from("service_status")
        .select("service_date, state, note, updated_at")
        .eq("service_id", serviceId)
        .eq("service_date", today)
        .maybeSingle(),
      db
        .from("alerts")
        .select("id, severity, title, body, published_at")
        .eq("service_id", serviceId)
        .is("retracted_at", null)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(10),
    ]);

    const snapshot: Operational = {
      status: statusResult.data
        ? {
            serviceDate: statusResult.data.service_date,
            state: statusResult.data.state,
            note: statusResult.data.note,
            updatedAt: statusResult.data.updated_at,
          }
        : null,
      alerts: ((alertsResult.data ?? []) as AlertRow[]).map(a => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        body: a.body,
        publishedAt: a.published_at,
      })),
      fetchedAt: Date.now(),
    };

    store(snapshot);
    return snapshot;
  }, cached());
}

/** "Last checked 09:14" — the sentence that keeps a cached alert honest. */
export function checkedLabel(snapshot: Operational | null): string {
  if (!snapshot) return "Not checked on this device yet";
  const when = new Date(snapshot.fetchedAt);
  const time = when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return freshnessOf(snapshot) === "live"
    ? `Last checked ${time}`
    : `Last checked ${time} — may be out of date`;
}
