import { useState } from "react";
import { Link } from "react-router-dom";
import { clearLocationConsent, locationConsent } from "../lib/consent";
import { eraseEverything, type EraseResult } from "../lib/erase";
import "./Privacy.css";

/**
 * The POPIA notice.
 *
 * Written to describe what this build actually does, not what the architecture
 * plans to do. Every line here is checkable against the code: if a claim on
 * this page stops being true, the page is wrong and must change with it.
 */
export default function Privacy() {
  const [confirming, setConfirming] = useState(false);
  const [erased, setErased] = useState<EraseResult | null>(null);

  const erase = async () => {
    setErased(await eraseEverything());
    setConfirming(false);
  };

  const [consent, setConsent] = useState(locationConsent());

  const withdraw = () => {
    clearLocationConsent();
    setConsent(locationConsent());
  };

  return (
    <div className="privacy-page">
      <div className="container">
        <header className="section privacy-header">
          <p className="t-eyebrow">Privacy</p>
          <h1 className="t-display t-display--lg privacy-header__heading">
            What we collect,{" "}<br />and what we don't.
          </h1>
          <p className="t-body privacy-header__sub">
            Shosholoza Trail is designed to work with as little of your data as possible.
            This notice describes the current build, in line with the Protection of
            Personal Information Act.
          </p>
        </header>

        <section className="privacy-section" aria-labelledby="location">
          <h2 id="location" className="t-heading t-heading--lg">Your location</h2>
          <p>
            The app asks before it reads your position, and only reads it while you have
            the live journey open. Your position is used on your own device to place you
            on the route, estimate arrival times and show what is near you.
          </p>
          <p>
            We do not keep a location history, we do not show your position to other
            passengers, and we do not sell or share it.
          </p>
          <p>
            If you tap <b>I'm at this point</b>, one position reading is sent to the
            journey service so the app can estimate how fast the train is actually
            moving. It is attached to a random browser-session identifier rather than
            your name or contact details. Readings from the same browser can be linked
            to that pseudonymous session so the service can rate-limit reports and
            calculate recent journey status.
          </p>
          <div className="privacy-control">
            <div>
              <b>Location permission on this device</b>
              <span>
                {consent === "granted" ? "You have allowed location use."
                  : consent === "declined" ? "You have declined location use."
                  : "You have not been asked yet."}
              </span>
            </div>
            <button className="btn btn--outline btn--sm" onClick={withdraw} disabled={consent === "unasked"}>
              Withdraw permission
            </button>
          </div>
          <p className="privacy-note">
            Withdrawing here clears your answer in this app. Your browser keeps its own
            site permission separately — you can reset that in your browser's site settings.
          </p>
        </section>

        <section className="privacy-section" aria-labelledby="accounts">
          <h2 id="accounts" className="t-heading t-heading--lg">Accounts and saved items</h2>
          <p>
            There is no required named account or password. Journey setup may ask for an
            optional first name and contact detail; those fields stay in this browser's
            storage and are not uploaded by this build. Saved places also stay on this device.
          </p>
          <p>
            If the optional Supabase sync service is configured, the app may create an
            anonymous backend session and mirror trip and reservation metadata so queued
            actions can survive weak connectivity. That anonymous sync does not include the
            name or contact detail stored in your local passenger record.
          </p>
          <p>
            One form is different, and it says so where it stands: the “want this on your
            next trip” sign-up. If you choose to type an email address or phone number
            there, that contact detail is sent to the sync service so we can tell you once
            when this runs on a real service. It only appears when a sync service is
            configured, every field on it is optional, and leaving it blank still records
            your interest.
          </p>
        </section>

        <section className="privacy-section" aria-labelledby="third-parties">
          <h2 id="third-parties" className="t-heading t-heading--lg">Who else sees a request</h2>
          <p>
            The journey draws satellite imagery, elevation and map data, and photographs
            from outside services. Loading them means those services receive your IP
            address and the area of the map you are looking at, the same as any website
            that shows a map. They do not receive your GPS position, and we send them no
            information about you.
          </p>
          <p>
            The <Link to="/credits">credits page</Link> lists each data and imagery source.
          </p>
        </section>

        <section className="privacy-section" aria-labelledby="offline">
          <h2 id="offline" className="t-heading t-heading--lg">Offline copies</h2>
          <p>
            The app stores the journey on your device so it keeps working without signal.
            That cache holds route, place and story data — no personal information. Clearing
            the site's data in your browser removes it.
          </p>
        </section>

        <section className="privacy-section" aria-labelledby="rights">
          <h2 id="rights" className="t-heading t-heading--lg">Your rights</h2>
          <p>
            Under POPIA you may ask what personal information we hold about you, ask us to
            correct or delete it, and object to how it is used. The deletion control below
            removes this app's local passenger data, trip, reservations, saved places,
            telemetry session identifier and offline caches. If an optional backend service
            has already received telemetry or synced trip/reservation metadata, local deletion
            cannot erase that remote copy; contact us to request deletion of server-held data.
          </p>
          <p className="privacy-contact">
            <b>Responsible party:</b> 4GeeksSakes, entrant in the Geekulcha Annual
            Hackathon 2026.<br />
            <b>Data requests and questions:</b>{" "}
            <a href="mailto:lindokuhle.nyoka03@gmail.com">lindokuhle.nyoka03@gmail.com</a>
          </p>

          {/*
            * A deletion right you can only exercise by hunting through browser
            * settings is not much of a right. This is the same action, done for
            * you, and it really does remove everything.
            */}
          <div className="privacy-erase">
            <h3>Delete everything on this phone</h3>
            <p>
              Removes your journey, your details, any reservations, your location
              answer, and every downloaded photograph and map tile. It cannot be
              undone, and the app will start over as though you had just arrived.
            </p>
            {erased ? (
              <p className="privacy-erase__done" role="status">
                Done — {erased.keysRemoved} stored {erased.keysRemoved === 1 ? "item" : "items"}{" "}
                and {erased.cachesRemoved} offline{" "}
                {erased.cachesRemoved === 1 ? "cache" : "caches"} removed
                {erased.storageFreedMb ? `, ${erased.storageFreedMb} MB freed` : ""}.
              </p>
            ) : confirming ? (
              <div className="privacy-erase__confirm">
                <p><b>Delete it all? This cannot be undone.</b></p>
                <button type="button" className="privacy-erase__go" onClick={erase}>
                  Yes, delete everything
                </button>
                <button type="button" className="privacy-erase__no" onClick={() => setConfirming(false)}>
                  Keep my data
                </button>
              </div>
            ) : (
              <button type="button" className="privacy-erase__start" onClick={() => setConfirming(true)}>
                Delete everything on this phone
              </button>
            )}
          </div>
        </section>

        <p className="privacy-updated">Last updated 20 September 2026.</p>
      </div>
    </div>
  );
}
