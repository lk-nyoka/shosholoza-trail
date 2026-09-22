import { useEffect, useState } from "react";

/**
 * Whether this rider has asked their device for less motion.
 *
 * Used by the ride for two things: it holds the camera steadier, and it caps
 * how far the lighting swings between a dark Karoo night and a Highveld
 * midday. A rider who is motion-sensitive on a phone in a moving train does
 * not need the screen going from black to white and back.
 *
 * `matchMedia` is absent in the test environment and in some older webviews,
 * so its absence is treated as "no preference expressed" rather than an error.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    setReduced(query.matches);
    // Safari below 14 only has the deprecated listener API.
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return reduced;
}

export default useReducedMotion;
