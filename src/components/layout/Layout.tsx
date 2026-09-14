import { Outlet, useLocation } from "react-router-dom";
import Nav from "./Nav";
import Footer from "./Footer";
import TabBar from "./TabBar";
import OfflineBanner from "../ui/OfflineBanner";
import { passenger } from "../../lib/passenger";

/** Routes that manage their own full-screen layout (no footer) */
const FULL_SCREEN = ["/journey", "/ride", "/app"];

export default function Layout() {
  const { pathname } = useLocation();
  const isFullScreen = FULL_SCREEN.includes(pathname);
  /**
   * Setup owns the whole screen: a nav bar offering eight other destinations is
   * the fastest way to lose someone halfway through three questions.
   */
  const isSetup = pathname === "/start";
  /** The tab bar belongs to people with a journey, not to browsers of a website. */
  const hasJourney = Boolean(passenger());

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {!isSetup && <Nav />}
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
