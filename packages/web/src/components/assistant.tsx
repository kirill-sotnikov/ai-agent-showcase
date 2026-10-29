"use client";

import * as styles from "../styles.css";
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
        <Chat
          state={view.workspace}
          ready={view.ready}
          busy={busy}
          connection={view.connection}
          partial={view.partial}
        />
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
