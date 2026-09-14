/**
 * VendorModal — what a claimed listing would look like.
 *
 * Opens a full-featured bottom-sheet / modal for a selected place.
 * For places with type "vendor" it shows menu items + a mock booking flow.
 * For attractions it shows opening hours + a "Add to itinerary" action.
 * Manages focus trap for keyboard / screen-reader accessibility.
 *
 * An honesty note, because it governs what may go in the table below. The
 * hours, items and prices here are ILLUSTRATIVE. Some of these businesses are
 * real; none of them has confirmed anything to us. So the panel carries a
 * notice saying exactly that, and it carries no telephone number and no
 * website link - those were removed rather than shipped unverified, because an
 * unverified number can ring a stranger and an unverified price can send
 * somebody to a counter with the wrong money in their hand. When a merchant
 * claims their listing through the backend, the notice comes off and these
 * fields become theirs to fill in.
 */
import { useEffect, useRef, useState } from "react";
import {
  X, Star, MapPin, Clock, ChevronRight,
  CheckCircle2, ShoppingBag, CalendarCheck, Info,
} from "lucide-react";
import type { Place } from "../../types";
import "./VendorModal.css";

// ── Static enrichment data ────────────────────────────────────────────────────
// Keyed by place.id — extra detail shown in the modal.

interface MenuItem  { name: string; desc: string; price: string; }
interface TimeSlot  { time: string; available: boolean; }

interface PlaceDetail {
  hours:    string;
  menuItems?: MenuItem[];
  timeSlots?: TimeSlot[];
  highlight?: string;
}

const DETAILS: Record<string, PlaceDetail> = {
  milner: {
    hours: "Check-in 14:00 · Check-out 10:00 · Dining 07:00–21:00",
    highlight: "Victorian landmark · National monument · Est. 1899",
    menuItems: [
      { name: "Cape Lamb Shank",      desc: "Slow-braised, served with roasted root vegetables and red wine jus.", price: "R285" },
      { name: "Karoo Springbok Loin", desc: "Pan-seared with fynbos butter, sweet potato purée and seasonal greens.", price: "R265" },
      { name: "Victorian Afternoon Tea", desc: "Finger sandwiches, scones with clotted cream, assorted pastries.", price: "R160" },
      { name: "Cape Brandy Pudding",  desc: "A classic South African dessert with vanilla custard.",            price: "R85" },
    ],
    timeSlots: [
      { time: "19:00", available: true  },
      { time: "19:30", available: false },
      { time: "20:00", available: true  },
      { time: "20:30", available: true  },
    ],
  },
  pantry: {
    hours: "Mon–Sun 07:00–17:00",
    highlight: "Only café on Matjiesfontein's preserved street",
    menuItems: [
      { name: "Koeksister",      desc: "Braided, syrup-soaked fried dough — a South African classic.", price: "R18" },
      { name: "Filter Coffee",   desc: "Freshly brewed Karoo blend.",                                  price: "R35" },
      { name: "Rusks & Butter",  desc: "Home-baked ouma rusks with salted farm butter.",               price: "R25" },
      { name: "Bobotie Toastie", desc: "Spiced Cape Malay mince on sourdough toast.",                  price: "R65" },
    ],
  },
  salt: {
    hours: "Mon–Sat 08:00–17:00 · Sun 09:00–14:00",
    highlight: "Ingredients sourced within 50 km of Beaufort West",
    menuItems: [
      { name: "Karoo Lamb Pie",       desc: "Free-range Karoo lamb in flaky shortcrust pastry.",       price: "R120" },
      { name: "Picnic Box (2 pax)",   desc: "Cheese, charcuterie, preserves, bread, fruit & wine.",    price: "R340" },
      { name: "Slow-Braised Ribs",    desc: "8-hour ribs with smoky rib sauce and coleslaw.",          price: "R185" },
      { name: "Lemon Posset",         desc: "Set cream dessert with local honeybush biscuit.",         price: "R75" },
    ],
    timeSlots: [
      { time: "12:00", available: true  },
      { time: "12:30", available: true  },
      { time: "13:00", available: false },
      { time: "13:30", available: true  },
    ],
  },
  market: {
    hours: "Thu–Sun 09:00–16:00",
    highlight: "30+ local makers · Free entry",
    menuItems: [
      { name: "Beaded Bracelet Set", desc: "Hand-threaded Ndebele-style beadwork.",      price: "R180" },
      { name: "Lino-Cut Print",      desc: "Original A3 Pretoria cityscape print.",       price: "R350" },
      { name: "Rooibos Gift Box",    desc: "Assorted loose-leaf rooibos, 200 g.",         price: "R120" },
    ],
  },
  watershed: {
    hours: "Daily 09:00–21:00",
    highlight: "150+ independent South African designers",
    menuItems: [
      { name: "Ceramic Espresso Cup", desc: "Hand-thrown, glazed in Cape clay tones.",     price: "R295" },
      { name: "Wire-frame Sculpture", desc: "Miniature Joburg skyline, wire-art.",         price: "R480" },
      { name: "Fynbos Candle",        desc: "Hand-poured with local botanical fragrance.", price: "R220" },
    ],
    timeSlots: [
      { time: "10:00", available: true  },
      { time: "11:00", available: true  },
      { time: "14:00", available: false },
      { time: "15:00", available: true  },
    ],
  },
  rosebank: {
    hours: "Sundays 09:00–17:00 only",
    highlight: "Rooftop market · Live music · Skyline views",
    menuItems: [
      { name: "Braai Broodjie",       desc: "Grilled cheese & tomato on a wood fire.",    price: "R55" },
      { name: "Bunny Chow (half)",    desc: "Spiced Durban curry in a hollowed loaf.",    price: "R95" },
      { name: "Handwoven Basket",     desc: "Zulu ilala palm basket, medium size.",       price: "R620" },
    ],
  },
  valley: {
    hours: "Mon–Sat 08:00–17:30 · Sun 09:00–14:00",
    highlight: "Direct from surrounding Breede Valley farms",
    menuItems: [
      { name: "Pinotage (bottle)",    desc: "Single-farm Worcester Pinotage, 2024 vintage.", price: "R195" },
      { name: "Nectarine Preserve",  desc: "Hand-jarred, no additives, 340 g.",             price: "R65" },
      { name: "Farm Cheese Board",   desc: "3 local cheeses with biscuits and preserve.",   price: "R180" },
    ],
  },
  padstal: {
    hours: "Daily 06:00–18:00",
    highlight: "Open since 1962 · Karoo road-trip institution",
    menuItems: [
      { name: "Roosterkoek",         desc: "Freshly baked, best eaten warm with butter.",  price: "R12" },
      { name: "Biltong (100 g)",     desc: "Beef or game, sliced or sticks.",              price: "R85" },
      { name: "Karoo Honey (jar)",   desc: "Raw, unfiltered Northern Cape honey.",         price: "R95" },
    ],
  },
  diamondcraft: {
    hours: "Mon–Fri 09:00–17:00 · Sat 09:00–13:00",
    highlight: "Supporting 12 Northern Cape artisans",
    menuItems: [
      { name: "Ceramic Bowl (hand-thrown)", desc: "Northern Cape clay, earth-glaze finish.", price: "R380" },
      { name: "Leather Card Holder",        desc: "Vegetable-tanned, hand-stitched.",         price: "R290" },
      { name: "Woven Wall Hanging",         desc: "Natural grass fibres, 40 cm square.",      price: "R520" },
    ],
  },
};

// ── Booking state machine ────────────────────────────────────────────────────

type BookingPhase = "browse" | "confirm" | "confirmed";

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  place: Place | null;
  onClose: () => void;
}

export default function VendorModal({ place, onClose }: Props) {
  const [bookingPhase, setBookingPhase] = useState<BookingPhase>("browse");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const dialogRef  = useRef<HTMLDivElement>(null);
  const closeRef   = useRef<HTMLButtonElement>(null);

  const detail = place ? DETAILS[place.id] : undefined;

  // Reset state when a new place opens
  useEffect(() => {
    if (place) {
      setBookingPhase("browse");
      setSelectedSlot(null);
      setSelectedItem(null);
      // Focus the close button on open
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [place?.id]);

  // ── Focus trap ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!place) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => !el.closest("[aria-hidden='true']"));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const els = focusable();
      if (els.length === 0) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [place, onClose]);

  if (!place) return null;

  const isVendor  = place.type === "vendor";
  const hasSlots  = !!detail?.timeSlots?.length;
  const hasMenu   = !!detail?.menuItems?.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="vm-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        className={["vm-sheet", bookingPhase === "confirmed" ? "vm-sheet--confirmed" : ""].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={`${place.name} details`}
      >
        {/* Header */}
        <div className="vm-header">
          <div className="vm-header__image">
            <img
              src={place.image}
              alt={`${place.name} — ${place.category}`}
              loading="lazy"
              width={640}
              height={260}
            />
            <div className="vm-header__overlay" aria-hidden="true" />
            <div className="vm-header__meta">
              <span className="t-eyebrow vm-header__category">{place.category}</span>
              <h2 className="vm-header__name">{place.name}</h2>
              <div className="vm-header__badges">
                <span className="vm-badge">
                  <Star size={11} aria-hidden="true" fill="currentColor" />
                  {place.rating.toFixed(1)}
                </span>
                <span className="vm-badge">
                  <MapPin size={11} aria-hidden="true" />
                  {place.distance}
                </span>
                {place.price && (
                  <span className="vm-badge">{place.price}</span>
                )}
              </div>
            </div>
          </div>
          <button
            ref={closeRef}
            className="vm-close"
            onClick={onClose}
            aria-label="Close vendor details"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="vm-body">
          {bookingPhase === "confirmed" ? (
            /* ── Confirmation ── */
            <div className="vm-confirmed">
              <CheckCircle2 size={48} aria-hidden="true" className="vm-confirmed__icon" />
              <h3 className="vm-confirmed__title">
                {hasSlots ? "Reservation confirmed" : "Added to itinerary"}
              </h3>
              <p className="vm-confirmed__desc">
                {hasSlots
                  ? `Your table at ${place.name} is reserved for ${selectedSlot}. Show this screen on arrival.`
                  : `${selectedItem ?? place.name} has been added to your trip plan.`}
              </p>
              <p className="vm-confirmed__note">
                This is a demo integration. In production this would connect to the
                venue's live booking system.
              </p>
              <button className="btn btn--outline-dark vm-confirmed__btn" onClick={onClose}>
                Back to map
              </button>
            </div>
          ) : bookingPhase === "confirm" ? (
            /* ── Confirm screen ── */
            <div className="vm-confirm-screen">
              <h3 className="vm-confirm-screen__title">
                Confirm {hasSlots ? "reservation" : "selection"}
              </h3>
              <div className="vm-confirm-screen__detail">
                <b>{place.name}</b>
                {selectedSlot && <span>{selectedSlot}</span>}
                {selectedItem && <span>{selectedItem}</span>}
              </div>
              <p className="vm-confirm-screen__note">
                Demo only — no real booking is made. Tap confirm to see the
                confirmation experience.
              </p>
              <div className="vm-confirm-screen__actions">
                <button
                  className="btn btn--primary"
                  onClick={() => setBookingPhase("confirmed")}
                >
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Confirm
                </button>
                <button
                  className="btn btn--outline-dark"
                  onClick={() => setBookingPhase("browse")}
                >
                  Go back
                </button>
              </div>
            </div>
          ) : (
            /* ── Browse ── */
            <>
              {/* About */}
              <section className="vm-section" aria-labelledby="vm-about">
                <h3 id="vm-about" className="vm-section__heading">About</h3>
                <p className="vm-section__text">{place.blurb}</p>
                {detail?.highlight && (
                  <p className="vm-highlight">{detail.highlight}</p>
                )}
              </section>

              {/* What this panel actually is. Not dismissable. */}
              {detail && (
                <p className="vm-illustrative" role="note">
                  <Info size={13} aria-hidden="true" />
                  <span>
                    <b>Example listing.</b> Hours, items and prices are illustrative
                    and have not been confirmed with this business. Check before you
                    rely on them.
                  </span>
                </p>
              )}

              {/* Hours */}
              {detail && (
                <section className="vm-section vm-info-row" aria-label="Opening hours">
                  {detail.hours && (
                    <div className="vm-info-item">
                      <Clock size={13} aria-hidden="true" />
                      <span>{detail.hours}</span>
                    </div>
                  )}
                </section>
              )}

              {/* Menu / Products */}
              {hasMenu && (
                <section className="vm-section" aria-labelledby="vm-menu">
                  <h3 id="vm-menu" className="vm-section__heading">
                    {isVendor ? "Menu & Products" : "Highlights"}
                  </h3>
                  <div className="vm-menu-list" role="list">
                    {detail!.menuItems!.map(item => (
                      <div
                        key={item.name}
                        className={[
                          "vm-menu-item",
                          selectedItem === item.name ? "vm-menu-item--selected" : "",
                        ].filter(Boolean).join(" ")}
                        role="listitem"
                      >
                        <button
                          className="vm-menu-item__btn"
                          onClick={() => setSelectedItem(
                            prev => prev === item.name ? null : item.name
                          )}
                          aria-pressed={selectedItem === item.name}
                          aria-label={`Select ${item.name} — ${item.price}`}
                        >
                          <div className="vm-menu-item__copy">
                            <span className="vm-menu-item__name">{item.name}</span>
                            <span className="vm-menu-item__desc">{item.desc}</span>
                          </div>
                          <span className="vm-menu-item__price">{item.price}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Time slots */}
              {hasSlots && (
                <section className="vm-section" aria-labelledby="vm-slots">
                  <h3 id="vm-slots" className="vm-section__heading">Available times</h3>
                  <div className="vm-slots" role="group" aria-label="Reservation time slots">
                    {detail!.timeSlots!.map(slot => (
                      <button
                        key={slot.time}
                        className={[
                          "vm-slot",
                          !slot.available     ? "vm-slot--full"     : "",
                          selectedSlot === slot.time ? "vm-slot--selected" : "",
                        ].filter(Boolean).join(" ")}
                        disabled={!slot.available}
                        onClick={() => setSelectedSlot(
                          prev => prev === slot.time ? null : slot.time
                        )}
                        aria-pressed={selectedSlot === slot.time}
                        aria-label={`${slot.time} — ${slot.available ? "available" : "fully booked"}`}
                      >
                        {slot.time}
                        {!slot.available && (
                          <span className="vm-slot__full-tag" aria-hidden="true">Full</span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* CTA */}
              <div className="vm-footer">
                <button
                  className="btn btn--primary vm-footer__cta"
                  disabled={hasSlots ? !selectedSlot : !selectedItem && !hasMenu}
                  onClick={() => setBookingPhase("confirm")}
                  aria-label={
                    hasSlots
                      ? selectedSlot ? `Reserve table at ${selectedSlot}` : "Select a time to reserve"
                      : selectedItem ? `Select ${selectedItem}` : "Add to itinerary"
                  }
                >
                  {hasSlots ? (
                    <><CalendarCheck size={15} aria-hidden="true" />
                      {selectedSlot ? `Reserve ${selectedSlot}` : "Choose a time"}</>
                  ) : (
                    <><ShoppingBag size={15} aria-hidden="true" />
                      {selectedItem ? `Select — ${selectedItem}` : "Add to itinerary"}</>
                  )}
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
