import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { PersistedState } from "@shop/contracts";
import { client } from "../../workspace";
import { Icon } from "../../ui/icon";
import { statuses, text } from "../../ui/text";

export function Chat({
  state,
  ready,
  busy,
  connection,
  partial,
}: {
  state: PersistedState;
  ready: boolean;
  busy: boolean;
  connection: string;
  partial: string;
}) {
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [state.messages.length, partial]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await client.start(draft)) setDraft("");
  };
  return (
    <>
      <div
        className="conversation"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {state.messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-icon">
              <Icon name="spark" size={33} />
            </div>
            <span className="eyebrow">A THOUGHTFUL WAY TO SHOP</span>
            <h2>{text.welcome}</h2>
            <p>{text.welcomeBody}</p>
            <div className="suggestions">
              {text.examples.map((example, index) => (
                <button key={example} onClick={() => setDraft(example)}>
                  <span>
                    {
                      ["Find & add", "Explore products", "Build your cart"][
                        index
                      ]
                    }
                  </span>
                  {example}
                  <Icon name="arrow" size={17} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {state.messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <span className="message-avatar">
                  {message.role === "assistant" ? (
                    <Icon name="spark" size={17} />
                  ) : (
                    "Y"
                  )}
                </span>
                <div>
                  <div className="message-meta">
                    {message.role === "assistant" ? "Assistant" : "You"}
                    <time>
                      {new Date(message.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>{message.content}</p>
                  {message.incomplete && <small>Incomplete response</small>}
                </div>
              </article>
            ))}
          </div>
        )}
        {partial && (
          <article className="message assistant">
            <span className="message-avatar">
              <Icon name="spark" size={17} />
            </span>
            <p>
              {partial}
              <small>Incomplete response</small>
            </p>
          </article>
        )}
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        <div className="run-status" role="status">
          {state.activeRun ? (
            <>
              <span className={busy ? "pulse dot online" : "dot"} />
              {statuses[state.activeRun.stage]}
              {state.activeRun.cartStatus === "committed" && (
                <span className="saved-tag">Cart saved</span>
              )}
            </>
          ) : (
            "Ready when you are."
          )}
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label className="sr-only" htmlFor="message">
            Message
          </label>
          <textarea
            id="message"
            rows={2}
            maxLength={4000}
            placeholder={text.input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              aria-label={text.stop}
              className="button stop"
              onClick={() => client.stop()}
            >
              {text.stop}
              <span>■</span>
            </button>
          ) : (
            <button
              className="button"
              disabled={
                !ready ||
                connection !== "Connected" ||
                !draft.trim() ||
                !navigator.locks
              }
            >
              {text.send}
              <Icon name="arrow" size={17} />
            </button>
          )}
        </form>
        <p className="input-hint">
          Enter to send <span>·</span> Shift + Enter for a new line
        </p>
      </div>
    </>
  );
}
