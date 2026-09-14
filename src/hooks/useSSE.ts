/**
 * useSSE — Server-Sent Events hook
 *
 * Connects to /api/v1/journeys/{journeyId}/stream and exposes the
 * latest simulated km value pushed by the backend every 2 s.
 * Falls back gracefully when offline or when the backend is unreachable.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

export type SSEStatus = "connecting" | "live" | "offline" | "error";

export interface SSEState {
  /** Latest server-authoritative route km, or null while connecting. */
  serverKm: number | null;
  status: SSEStatus;
  /** Call to manually close and reopen the connection. */
  reconnect: () => void;
}

const RECONNECT_DELAY_MS = 4000;
const MAX_RECONNECTS = 8;

export function useSSE(journeyId: string, enabled = true): SSEState {
  const [serverKm, setServerKm] = useState<number | null>(null);
  const [sseStatus, setSseStatus] = useState<SSEStatus>("connecting");

  const esRef        = useRef<EventSource | null>(null);
  const attemptsRef  = useRef(0);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef   = useRef(enabled);
  enabledRef.current = enabled;

  const close = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (esRef.current)    { esRef.current.close(); esRef.current = null; }
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    close();

    if (!navigator.onLine) {
      setSseStatus("offline");
      timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      return;
    }

    setSseStatus("connecting");
    const url = `${API_BASE}/journeys/${journeyId}/stream`;
    const es  = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      attemptsRef.current = 0;
      setSseStatus("live");
    };

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as { km: number };
        if (typeof data.km === "number") setServerKm(data.km);
      } catch {
        // malformed frame — ignore
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setSseStatus(navigator.onLine ? "error" : "offline");
      attemptsRef.current += 1;
      if (attemptsRef.current <= MAX_RECONNECTS) {
        timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }, [close, journeyId]);

  // Online / offline listeners drive reconnect
  useEffect(() => {
    const goOnline  = () => { attemptsRef.current = 0; connect(); };
    const goOffline = () => { close(); setSseStatus("offline"); };
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [close, connect]);

  // Initial connection
  useEffect(() => {
    if (enabled) connect();
    return close;
  }, [enabled, connect, close]);

  return { serverKm, status: sseStatus, reconnect: connect };
}
