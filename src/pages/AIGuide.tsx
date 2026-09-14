import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, AlertCircle, Database } from "lucide-react";
import { answer, CORPUS } from "../lib/aiEngine";
import { stops } from "../data";
import "./AIGuide.css";

interface Message {
  id:   string;
  role: "user" | "assistant";
  text: string;
  /** doc type badge shown on assistant messages */
  badge?: string;
}

const SUGGESTED = [
  "What should I eat in Matjiesfontein?",
  "Tell me about the Big Hole in Kimberley.",
  "Can I book a room at Lord Milner Hotel?",
  "How long does the journey take?",
  "Does the app work offline in the Karoo?",
  "What's there to do in Bo-Kaap?",
  "Best place to buy crafts in Johannesburg?",
];

/**
 * The corpus, listed by name.
 *
 * This panel used to show a count per stop — "Pretoria, 4 docs" — which tells a
 * reader nothing about what the guide actually knows and invites the obvious
 * question about what "verified" means. Every document has a title and a kind;
 * show them, so the claim can be checked rather than taken on faith.
 */
const SOURCES_BY_STOP: Record<string, typeof CORPUS> = {};
for (const doc of CORPUS) {
  (SOURCES_BY_STOP[doc.stopId] ??= []).push(doc);
}
const SOURCE_COUNT = CORPUS.length;

const TYPE_LABEL: Record<string, string> = {
  factual: "Fact", historical: "History", food: "Food",
  nature: "Nature", booking: "Booking", transit: "Journey",
};

export default function AIGuide() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id:   "welcome",
      role: "assistant",
      text: "Hello. I'm the Shosholoza Trail guide. I can tell you about all eight stops along the 1 568 km rail corridor between Pretoria and Cape Town — places to eat, history, nature, accommodation and the journey itself. Every answer comes from documents written and checked for this route — you can read the full list of them on this page. What would you like to know?",
    },
  ]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showSrc, setShowSrc] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const send = (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Slight delay simulates retrieval latency, keeps UX honest
    setTimeout(() => {
      const replyText = answer(text);
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: replyText },
      ]);
      setLoading(false);
      // focus back to input after reply
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 50);
    }, 480);
  };

  // Allow Enter to submit
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <div className="ai-page">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div className="ai-page__sidebar">
        <div className="container ai-page__sidebar-inner">
          <header className="ai-page__header">
            <span className="ai-page__icon" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="t-eyebrow">AI Guide</p>
              <h1 className="t-display t-display--sm ai-page__heading">
                Ask the<br />corridor.
              </h1>
            </div>
          </header>

          {/* Grounding disclaimer */}
          <div className="ai-page__disclaimer" role="note">
            <AlertCircle size={13} aria-hidden="true" />
            <span>
              Every answer is retrieved from a{" "}
              <strong>structured knowledge base</strong> of {SOURCE_COUNT} verified
              documents. Answers are constrained to that corridor knowledge base — nothing is written for you on the spot.
            </span>
          </div>

          {/* Corpus source toggle */}
          <button
            className="ai-sources-toggle"
            onClick={() => setShowSrc(v => !v)}
            aria-expanded={showSrc}
            aria-controls="ai-sources-panel"
          >
            <Database size={12} aria-hidden="true" />
            {showSrc ? "Hide sources" : `View ${SOURCE_COUNT} source documents`}
          </button>

          {showSrc && (
            <div id="ai-sources-panel" className="ai-sources-panel" aria-label="Knowledge base sources">
              <p className="ai-sources-panel__label t-eyebrow">
                Every document the guide can answer from
              </p>
              {[...stops, { id: "_route", name: "The journey itself" }].map(place => {
                const docs = SOURCES_BY_STOP[place.id] ?? [];
                if (docs.length === 0) return null;
                return (
                  <div key={place.id} className="ai-sources-group">
                    <div className="ai-sources-panel__row">
                      <span>{place.name}</span>
                      <span className="ai-sources-panel__count">{docs.length}</span>
                    </div>
                    <ul className="ai-sources-list">
                      {docs.map(doc => (
                        <li key={doc.id}>
                          <span className="ai-sources-list__kind">{TYPE_LABEL[doc.type] ?? doc.type}</span>
                          {doc.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <p className="ai-sources-foot">
                Written and checked by the team against published sources, and shipped inside the
                app — which is why the guide still answers with no signal, and why it will tell
                you it does not know rather than invent something.
              </p>
            </div>
          )}

          {/* Suggested questions */}
          <div className="ai-page__suggestions" aria-label="Suggested questions">
            <p className="t-eyebrow ai-page__suggestions-label">Try asking</p>
            {SUGGESTED.map(s => (
              <button
                key={s}
                className="ai-suggestion"
                onClick={() => send(s)}
                aria-label={`Ask: ${s}`}
                disabled={loading}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chat ────────────────────────────────────────────── */}
      <div className="ai-page__chat" role="region" aria-label="AI Guide conversation">
        <div
          className="ai-messages"
          role="log"
          aria-live="polite"
          aria-label="Conversation history"
          aria-atomic="false"
        >
          {messages.map(msg => (
            <div
              key={msg.id}
              className={["ai-message", `ai-message--${msg.role}`].join(" ")}
            >
              {msg.role === "assistant" && (
                <span className="ai-message__avatar" aria-hidden="true">
                  <Sparkles size={13} />
                </span>
              )}
              <p className="ai-message__text" style={{ whiteSpace: "pre-line" }}>
                {msg.text}
              </p>
            </div>
          ))}

          {loading && (
            <div
              className="ai-message ai-message--assistant"
              aria-label="Guide is retrieving an answer"
              role="status"
            >
              <span className="ai-message__avatar" aria-hidden="true">
                <Sparkles size={13} />
              </span>
              <span className="ai-typing" aria-hidden="true">
                <i /><i /><i />
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="ai-input-bar"
          onSubmit={e => { e.preventDefault(); send(input); }}
          aria-label="Ask a question about the Shosholoza Trail"
        >
          <input
            ref={inputRef}
            className="ai-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about any stop, vendor or the journey…"
            aria-label="Your question"
            disabled={loading}
            autoComplete="off"
            spellCheck
          />
          <button
            type="submit"
            className="ai-send"
            disabled={!input.trim() || loading}
            aria-label="Send message"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
