"use client";

import * as styles from "../styles.css";
import { text } from "../ui/text";
import { useWorkspace, useWorkspaceActions } from "../workspace";
import { Cart } from "./cart/cart";
import { Chat } from "./chat/chat";
import { ExecutionLog } from "./execution-log/execution-log";

export function Assistant() {
  const view = useWorkspace((state) => state);
  const { busy, disabled, act } = useWorkspaceActions();

  if (!view.workspace) return null;

  return (
    <main className={styles.assistantGrid}>
      <section
        className={`${styles.panel} ${styles.chatPanel}`}
        aria-label="Assistant chat"
      >
        <div className={styles.panelHeading}>
          <div>
            <h1>{text.assistant}</h1>
          </div>
          <div className={styles.connection} role="status">
            <span
              className={
                view.connection === "Connected"
                  ? `${styles.dot} ${styles.online}`
                  : styles.dot
              }
            />
            {view.connection}
          </div>
        </div>
        <Chat
          state={view.workspace}
          ready={view.ready}
          busy={busy}
          connection={view.connection}
          partial={view.partial}
        />
        <div className={styles.chatFootnote}>
          <span className={`${styles.dot} ${styles.online}`} />
          {view.provider === "fake" ? text.fake : text.openai}
          <span>Catalog facts. Verified cart changes.</span>
        </div>
      </section>
      <div className={styles.rightPanels}>
        <Cart
          state={view.workspace}
          disabled={disabled}
          act={act}
          pending={!!view.pending}
        />
        <ExecutionLog state={view.workspace} />
      </div>
    </main>
  );
}
