import type { PersistedState } from "@shop/shared/contracts";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import * as styles from "../../styles.css";
import { statuses, text } from "../../ui/text";
import { useWorkspaceClient } from "../../workspace";
import { Icon } from "../ui/icon";

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
  const client = useWorkspaceClient();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.messages.length > 0 || partial)
      bottom.current?.scrollIntoView({ block: "nearest" });
  }, [state.messages.length, partial]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await client.start(draft)) setDraft("");
  };

  return (
    <>
      <div
        className={styles.conversation}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {state.messages.length === 0 ? (
          <div className={styles.welcome}>
            <div className={styles.welcomeIcon}>
              <Icon name="spark" size={33} />
            </div>
            <h2>{text.welcome}</h2>
            <p>{text.welcomeBody}</p>
            <div className={styles.suggestions}>
              {text.examples.map((example, index) => (
                <button key={example} onClick={() => setDraft(example)}>
                  <span>
                    {
                      ["Find & add", "Explore products"][
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
          <div className={styles.messages}>
            {state.messages.map((message) => (
              <article
                data-message-role={message.role}
                key={message.id}
                className={`${styles.message} ${styles[message.role]}`}
              >
                <span className={styles.messageAvatar}>
                  {message.role === "assistant" ? (
                    <Icon name="spark" size={17} />
                  ) : (
                    "Y"
                  )}
                </span>
                <div>
                  <div className={styles.messageMeta}>
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
          <article className={`${styles.message} ${styles.assistant}`}>
            <span className={styles.messageAvatar}>
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
      <div className={styles.composerArea}>
        <div
          data-testid="run-status"
          className={styles.runStatus}
          role="status"
        >
          {state.activeRun ? (
            <>
              <span
                className={
                  busy
                    ? `${styles.pulse} ${styles.dot} ${styles.online}`
                    : styles.dot
                }
              />
              {statuses[state.activeRun.stage]}
              {state.activeRun.cartStatus === "committed" && (
                <span className={styles.savedTag}>Cart saved</span>
              )}
            </>
          ) : (
            "Ready when you are."
          )}
        </div>
        <form
          className={styles.composer}
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label className={styles.srOnly} htmlFor="message">
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
              className={`${styles.button} ${styles.stop}`}
              onClick={() => client.stop()}
            >
              {text.stop}
              <span>■</span>
            </button>
          ) : (
            <button
              className={styles.button}
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
        <p className={styles.inputHint}>
          Enter to send <span>·</span> Shift + Enter for a new line
        </p>
      </div>
    </>
  );
}
