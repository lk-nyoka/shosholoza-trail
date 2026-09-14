import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Compass, MessageCircleQuestion, TicketCheck, TrainFront } from "lucide-react";
import "./TabBar.css";

/**
 * The bar every traveller already knows how to use.
 *
 * It appears only once someone has a journey — before that the site is a
 * website and a tab bar would be noise. Four destinations, because five is
 * where these bars start becoming a menu.
 *
 * The marker is one element that travels between tabs rather than four that
 * switch on and off. That is the difference between a cursor and a light
 * switch, and it is the one flourish in here that is genuinely functional: the
 * eye follows the movement and learns where it just came from.
 */
const TABS = [
  { to: "/trip",         label: "Journey",  icon: TicketCheck },
  { to: "/ride",         label: "The Line", icon: TrainFront },
  { to: "/destinations", label: "Stops",    icon: Compass },
  { to: "/ai",           label: "Guide",    icon: MessageCircleQuestion },
];

export default function TabBar() {
  const { pathname } = useLocation();
  const barRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const place = () => {
      const active = bar.querySelector<HTMLElement>(".tabbar__tab.active");
      if (!active) { setMarker(null); return; }
      setMarker({ x: active.offsetLeft, w: active.offsetWidth });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [pathname]);

  return (
    <nav className="tabbar" aria-label="Your journey" ref={barRef}>
      {marker && (
        <span
          className="tabbar__indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${marker.x}px)`, width: marker.w }}
        />
      )}
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => ["tabbar__tab", isActive ? "active" : ""].filter(Boolean).join(" ")}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
