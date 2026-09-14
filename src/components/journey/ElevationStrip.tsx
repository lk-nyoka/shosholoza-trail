import { useEffect, useMemo, useRef, useState } from "react";
import { routeProfile, type RouteProfile } from "../../lib/elevationProfile";
import type { Stop } from "../../types";
import "./elevation-strip.css";

/**
 * The journey's vertical shape - the part a flat map cannot show.
 *
 * Measured from the DEM: Pretoria 1,358 m, Johannesburg 1,780 m, De Aar
 * 1,252 m, Beaufort West 785 m, Worcester 235 m, Cape Town 10 m. The line
 * climbs onto the Highveld, holds the Karoo plateau, then drops through the
 * Hex River mountains to sea level.
 *
 * One series, so no legend - the title names it. Travelled ground is drawn in
 * the route accent and the road ahead stays muted, which is a progress
 * encoding rather than two categories.
 */
interface Props {
  km: number;
  totalKm: number;
  stops: Stop[];
  onSeek?: (km: number) => void;
}

const WIDTH = 1000;
const HEIGHT = 132;
const PAD_TOP = 14;
const PAD_BOTTOM = 20;

export function ElevationStrip({ km, totalKm, stops, onSeek }: Props) {
  const [profile, setProfile] = useState<RouteProfile | null>(null);
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    routeProfile()
      .then(result => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const geometry = useMemo(() => {
    if (!profile) return null;
    const { points, minMetres, maxMetres } = profile;
    const span = Math.max(1, maxMetres - minMetres);
    const x = (value: number) => (value / totalKm) * WIDTH;
    const y = (metres: number) =>
      HEIGHT - PAD_BOTTOM - ((metres - minMetres) / span) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

    const line = points.map(point => `${x(point.km).toFixed(1)},${y(point.metres).toFixed(1)}`);
    const area = `M0,${HEIGHT - PAD_BOTTOM} L${line.join(" L")} L${WIDTH},${HEIGHT - PAD_BOTTOM} Z`;
    return { x, y, area, line, span };
  }, [profile, totalKm]);

  const elevationAt = (value: number) => {
    if (!profile) return null;
    const index = Math.round((value / totalKm) * (profile.points.length - 1));
    return profile.points[Math.max(0, Math.min(profile.points.length - 1, index))]?.metres ?? null;
  };

  const readKm = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return Math.max(0, Math.min(totalKm, ((event.clientX - rect.left) / rect.width) * totalKm));
  };

  if (!geometry || !profile) {
    return <div className="elev-strip elev-strip--loading">Reading elevation…</div>;
  }

  const progressX = geometry.x(km);
  const cursorKm = hoverKm ?? km;
  const cursorMetres = elevationAt(cursorKm);

  return (
    <figure className="elev-strip" aria-label="Elevation profile along the route">
      <figcaption className="elev-strip__caption">
        <span>Elevation</span>
        <strong>
          {elevationAt(km)?.toLocaleString()} m
        </strong>
        <span className="elev-strip__range">
          {profile.minMetres} – {profile.maxMetres.toLocaleString()} m
        </span>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="elev-strip__svg"
        role="img"
        onMouseMove={event => setHoverKm(readKm(event))}
        onMouseLeave={() => setHoverKm(null)}
        onClick={event => {
          const value = readKm(event);
          if (value !== null) onSeek?.(value);
        }}
      >
        <defs>
          <clipPath id="elev-travelled">
            <rect x="0" y="0" width={Math.max(0, progressX)} height={HEIGHT} />
          </clipPath>
        </defs>

        {/* Road ahead: recessive. */}
        <path d={geometry.area} className="elev-strip__ahead" />
        {/* Ground already covered, same series, accented. */}
        <path d={geometry.area} className="elev-strip__done" clipPath="url(#elev-travelled)" />
        <polyline points={geometry.line.join(" ")} className="elev-strip__line" />

        {stops.map(stop => (
          <g key={stop.id} className="elev-strip__stop">
            <line
              x1={geometry.x(stop.km)}
              x2={geometry.x(stop.km)}
              y1={PAD_TOP - 6}
              y2={HEIGHT - PAD_BOTTOM}
            />
            <text x={geometry.x(stop.km)} y={HEIGHT - 6}>
              {stop.name}
            </text>
          </g>
        ))}

        <line
          x1={progressX}
          x2={progressX}
          y1={PAD_TOP - 10}
          y2={HEIGHT - PAD_BOTTOM}
          className="elev-strip__now"
        />
        <circle
          cx={progressX}
          cy={geometry.y(elevationAt(km) ?? 0)}
          r="5"
          className="elev-strip__marker"
        />

        {hoverKm !== null && (
          <line
            x1={geometry.x(hoverKm)}
            x2={geometry.x(hoverKm)}
            y1={PAD_TOP - 10}
            y2={HEIGHT - PAD_BOTTOM}
            className="elev-strip__hover"
          />
        )}
      </svg>
      <p className="elev-strip__readout" aria-live="polite">
        {Math.round(cursorKm)} km · {cursorMetres?.toLocaleString()} m
        {hoverKm !== null ? " · click to jump" : ""}
      </p>
    </figure>
  );
}
