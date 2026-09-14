import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Shot } from "../../data/gallery";
import "./PhotoCarousel.css";

interface Props {
  shots: Shot[];
  place: string;
}

/**
 * A swipeable strip rather than an auto-playing slideshow: a passenger deciding
 * whether to get off wants to move through the pictures at their own pace, and
 * movement they did not ask for is the first thing that reads as an
 * advertisement.
 */
export default function PhotoCarousel({ shots, place }: Props) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setIndex(0); trackRef.current?.scrollTo({ left: 0 }); }, [place]);

  if (shots.length === 0) return null;

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(shots.length - 1, next));
    setIndex(clamped);
    const track = trackRef.current;
    if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <section className="carousel" aria-label={`Photographs of ${place}`}>
      <div className="carousel__track" ref={trackRef} onScroll={onScroll} tabIndex={0}>
        {shots.map((shot, i) => (
          <figure className="carousel__slide" key={shot.file}>
            <img
              src={shot.url}
              alt={`${shot.caption} — ${place}`}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
            <figcaption>{shot.caption}</figcaption>
          </figure>
        ))}
      </div>

      {shots.length > 1 && (
        <>
          <button
            className="carousel__arrow carousel__arrow--prev"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="Previous photograph"
            type="button"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            className="carousel__arrow carousel__arrow--next"
            onClick={() => go(index + 1)}
            disabled={index === shots.length - 1}
            aria-label="Next photograph"
            type="button"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <div className="carousel__dots" role="tablist" aria-label="Photograph">
            {shots.map((shot, i) => (
              <button
                key={shot.file}
                className={["carousel__dot", i === index ? "active" : ""].filter(Boolean).join(" ")}
                onClick={() => go(i)}
                role="tab"
                aria-selected={i === index}
                aria-label={`Photograph ${i + 1} of ${shots.length}`}
                type="button"
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
