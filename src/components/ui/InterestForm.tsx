import { useState } from "react";
import { backendConfigured } from "../../lib/backend/client";
import { enqueue, newKey } from "../../lib/backend/outbox";
import "./InterestForm.css";

/**
 * The list of people who want this to exist.
 *
 * It is deliberately the thinnest form in the app: no name, no required field,
 * one optional way to reach you. Every honest review of this project has said
 * the same thing — the code is ahead of the evidence — and a list of real
 * people who asked to be told when it ships is the cheapest evidence there is.
 *
 * What is collected is stated on the form itself rather than buried in the
 * privacy page, because a person deciding whether to type their number should
 * not have to go and look it up.
 */
export default function InterestForm({ source }: { source: string }) {
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"passenger" | "merchant" | "operator">("passenger");
  const [sent, setSent] = useState(false);

  if (!backendConfigured) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!contact.trim() && !message.trim()) return;
    enqueue({
      kind: "interest",
      idempotencyKey: newKey(),
      contact: contact.trim() || null,
      interestKind: kind,
      message: message.trim() || null,
      source,
    });
    setSent(true);
  };

  if (sent) {
    return (
      <div className="interest interest--done" role="status">
        <p><b>Thank you — you're on the list.</b></p>
        <p>
          If you left a contact we'll use it once, to tell you when this runs on a
          real service. Nothing else, and no one else.
        </p>
      </div>
    );
  }

  return (
    <form className="interest" onSubmit={submit}>
      <h3 className="interest__title">Want this on your next trip?</h3>
      <p className="interest__body">
        This is a working prototype, not a service you can rely on yet. Tell us who
        you are and we'll let you know when that changes.
      </p>

      <fieldset className="interest__who">
        <legend className="sr-only">I am a</legend>
        {(["passenger", "merchant", "operator"] as const).map(option => (
          <label key={option} className={kind === option ? "is-on" : undefined}>
            <input
              type="radio"
              name="interest-kind"
              value={option}
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            {option === "passenger" ? "I travel this line"
              : option === "merchant" ? "I trade near a stop"
              : "I work for an operator"}
          </label>
        ))}
      </fieldset>

      <label className="interest__field">
        <span>Email or phone <em>(optional)</em></span>
        <input
          type="text"
          inputMode="email"
          autoComplete="email"
          value={contact}
          onChange={e => setContact(e.target.value)}
          placeholder="Leave blank if you'd rather not"
        />
      </label>

      <label className="interest__field">
        <span>Anything you'd want it to do <em>(optional)</em></span>
        <textarea
          rows={3}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="What would actually help you on this train?"
        />
      </label>

      <p className="interest__notice">
        We store exactly what you type here and nothing else — no name, no location,
        no device details. It is used to contact you about this project and is never
        sold or shared. Ask us and we'll delete it.
      </p>

      <button type="submit" className="interest__submit">Add me to the list</button>
    </form>
  );
}
