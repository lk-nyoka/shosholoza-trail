/**
 * Writes that survive the tunnel.
 *
 * A passenger reserving a pie at Matjiesfontein has, at best, an intermittent
 * signal and, at worst, none at all for the next four hours. Losing the
 * request because the radio happened to be down at the moment they pressed the
 * button would be the single most annoying thing this app could do.
 *
 * So every write goes into a queue on the device first and is sent when there
 * is something to send it over. Each entry carries a key the passenger's own
 * device generated, and the database treats a repeat of that key as the same
 * request rather than a second one — so a flaky connection that sends the same
 * thing three times still produces one reservation.
 */
import { backend, online } from "./client";
import { ensureSession } from "./session";
import { announceReservation } from "./confirmations";

const KEY = "st.outbox.v1";

export type OutboxJob =
  | {
      kind: "reservation";
      idempotencyKey: string;
      /** The app's own identifier for the listing — see places.slug. */
      placeSlug: string;
      offerId?: string | null;
      serviceDate?: string | null;
      note?: string | null;
    }
  | {
      kind: "trip";
      idempotencyKey: string;
      boardStop: string;
      alightStop: string;
      serviceDate?: string | null;
      stopMinutes: number;
    }
  | {
      kind: "interest";
      idempotencyKey: string;
      contact?: string | null;
      interestKind: "passenger" | "merchant" | "operator";
      message?: string | null;
      source?: string | null;
    };

export interface QueuedJob {
  job: OutboxJob;
  queuedAt: number;
  attempts: number;
}

export function newKey(): string {
  return crypto.randomUUID();
}

function readQueue(): QueuedJob[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedJob[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(list: QueuedJob[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* The queue is best effort. Losing it loses a pending write, not the app. */
  }
}

export function pendingCount(): number {
  return readQueue().length;
}

export function enqueue(job: OutboxJob): void {
  writeQueue([...readQueue(), { job, queuedAt: Date.now(), attempts: 0 }]);
  void flush();
}

let flushing = false;

/**
 * Send what we can. Anything that fails stays in the queue for the next
 * attempt; anything the server refuses outright is dropped, because retrying
 * it forever would only mean it is refused forever.
 */
export async function flush(): Promise<void> {
  if (flushing || !online()) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  const db = await backend();
  if (!db) return;
  const uid = await ensureSession();
  if (!uid) return;

  flushing = true;
  const remaining: QueuedJob[] = [];

  try {
    for (const entry of queue) {
      const outcome = await send(db, entry.job, uid);
      if (outcome === "sent" || outcome === "refused") continue;
      remaining.push({ ...entry, attempts: entry.attempts + 1 });
    }
  } finally {
    writeQueue(remaining);
    flushing = false;
  }
}

type Outcome = "sent" | "retry" | "refused";

async function send(
  db: NonNullable<Awaited<ReturnType<typeof backend>>>,
  job: OutboxJob,
  uid: string,
): Promise<Outcome> {
  try {
    if (job.kind === "reservation") {
      const { data, error } = await db.rpc("request_reservation", {
        p_place_slug: job.placeSlug,
        p_offer_id: job.offerId ?? null,
        p_service_date: job.serviceDate ?? null,
        p_note: job.note ?? null,
        p_idempotency_key: job.idempotencyKey,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row?.code) {
        announceReservation({
          idempotencyKey: job.idempotencyKey,
          code: row.code,
          state: row.state ?? "requested",
        });
      }
      return verdict(error);
    }

    if (job.kind === "trip") {
      const { error } = await db.from("trips").upsert(
        {
          passenger_id: uid,
          board_stop: job.boardStop,
          alight_stop: job.alightStop,
          service_date: job.serviceDate ?? null,
          stop_minutes: job.stopMinutes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "passenger_id" },
      );
      return verdict(error);
    }

    const { error } = await db.from("interest").insert({
      contact: job.contact ?? null,
      kind: job.interestKind,
      message: job.message ?? null,
      source: job.source ?? null,
    });
    return verdict(error);
  } catch {
    return "retry";
  }
}

/**
 * A network problem is worth retrying. A rejection is not: if the database
 * says no, saying it again in ten minutes will not change its mind.
 */
function verdict(error: { code?: string; message?: string } | null): Outcome {
  if (!error) return "sent";
  const code = error.code ?? "";
  if (code.startsWith("23") || code.startsWith("42") || code === "P0001") return "refused";
  return "retry";
}

/** Try again whenever the device gets its signal back. */
export function watchConnectivity(): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => void flush();
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}
