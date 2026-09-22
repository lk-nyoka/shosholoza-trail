import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Nav from "./Nav";
import Footer from "./Footer";
import TabBar from "./TabBar";
import OfflineBanner from "../ui/OfflineBanner";
import { passenger } from "../../lib/passenger";

/** Routes that manage their own full-screen layout (no footer) */
const FULL_SCREEN = ["/journey", "/ride", "/app"];

/**
 * Routes that draw their own top bar, so the site header must stand down.
 *
 * The Ride was rebuilt around the animation — "one bar at the top, one at the
 * bottom" — but the header kept rendering underneath it, and the two occupied
 * the same 72 px. Measured at 390 px the site header sat at y 0–72 and the
 * ride's own bar at y 12–131, drawn straight over it. Hiding the header here
 * ends the collision and hands those 72 px back to the thing people came to
 * look at. The ride bar carries its own way home so nobody is stranded.
 *
 * /journey and /app are full-bleed but have no competing bar of their own, so
 * they keep the header.
 */
const OWN_TOP_BAR = ["/ride"];

/**
 * What the browser tab, the history entry and a pasted link say.
 *
 * Every route used to render under one title — "Shosholoza Trail — Live Rail
 * Journey" — so eight open tabs were indistinguishable, browser history was
 * useless, and sharing the stop hub for Kimberley looked identical to sharing
 * the privacy page. Only the 404 bothered to rename itself.
 */
const SITE = "Shosholoza Trail";
const TITLES: Record<string, string> = {
  "/": `${SITE} — the Pretoria\u2013Cape Town line`,
  "/start": `Set up your journey — ${SITE}`,
  "/trip": `My journey — ${SITE}`,
  "/ride": `The Ride — ${SITE}`,
  "/journey": `Route overview — ${SITE}`,
  "/destinations": `Stops and places — ${SITE}`,
  "/stories": `Stories from the corridor — ${SITE}`,
  "/ai": `Route guide — ${SITE}`,
  "/plan": `Plan a trip — ${SITE}`,
  "/app": `Live journey — ${SITE}`,
  "/help": `Before you board — ${SITE}`,
  "/privacy": `Privacy — ${SITE}`,
  "/credits": `Credits — ${SITE}`,
  "/shosholoza": `The song — ${SITE}`,
  "/operator": `Operator demo — ${SITE}`,
};

function titleFor(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const stop = pathname.match(/^\/stops\/([^/]+)$/);
  if (stop) {
    const name = decodeURIComponent(stop[1])
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return `${name} — ${SITE}`;
  }
  return `Page not found — ${SITE}`;
}

export default function Layout() {
  const { pathname } = useLocation();
  const isFullScreen = FULL_SCREEN.includes(pathname);
  /**
   * Setup owns the whole screen: a nav bar offering eight other destinations is
   * the fastest way to lose someone halfway through three questions.
   */
  const isSetup = pathname === "/start";
  const ownsTopBar = OWN_TOP_BAR.includes(pathname);

  useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);
  /** The tab bar belongs to people with a journey, not to browsers of a website. */
  const hasJourney = Boolean(passenger());

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {!isSetup && !ownsTopBar && <Nav />}
      <main
        id="main-content"
        key={pathname}
        className="page-enter"
        style={isFullScreen ? { flex: 1 } : undefined}
      >
        <Outlet />
      </main>
      {!isFullScreen && !isSetup && <Footer />}
      {hasJourney && !isSetup && <TabBar />}
      <OfflineBanner />
    </>
  );
}
