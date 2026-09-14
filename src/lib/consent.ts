/**
 * Location consent.
 *
 * The SSDLC records passenger-location exposure as the one critical-severity
 * risk on this project: GPS is collected only during an active journey and only
 * with explicit permission. The browser's own permission prompt is not that
 * permission — it asks whether the site may read a position, not whether the
 * passenger understood what this app does with it. So nothing here touches
 * navigator.geolocation until the passenger has been shown the notice and said
 * yes, and the answer is kept on their own device, never sent anywhere.
 */
const KEY = "st.location-consent.v1";

export type ConsentState = "granted" | "declined" | "unasked";

export function locationConsent(): ConsentState {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === "granted" || stored === "declined" ? stored : "unasked";
  } catch {
    // Private windows and blocked site data throw rather than return null.
    // Treat that as never having asked: the passenger sees the notice again.
    return "unasked";
  }
}

export function setLocationConsent(state: Exclude<ConsentState, "unasked">): void {
  try {
    window.localStorage.setItem(KEY, state);
  } catch {
    /* The session still works; the passenger is simply asked again next time. */
  }
}

/** Used by the privacy page so a passenger can take the permission back. */
export function clearLocationConsent(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
