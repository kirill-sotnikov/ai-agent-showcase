"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import * as styles from "../styles.css";
import { text } from "../ui/text";
import { useWorkspace, useWorkspaceClient } from "../workspace";
import { Icon } from "./ui/icon";

export function AppShell({ children }: { children: ReactNode }) {
  const view = useWorkspace((state) => state);
  const client = useWorkspaceClient();
  const pathname = usePathname();

  return (
    <div className={styles.appShell}>
      <header className={styles.appHeader}>
        <Link className={styles.brand} href="/">
          <span>
            {text.brand}
            <small>SHOWCASE</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            className={pathname === "/" ? styles.active : undefined}
            aria-current={pathname === "/" ? "page" : undefined}
          >
            <Icon name="spark" size={17} />
            {text.assistant}
          </Link>
          <Link
            href="/settings"
            className={pathname === "/settings" ? styles.active : undefined}
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Icon name="settings" size={17} />
            {text.settings}
          </Link>
        </nav>
        <span className={styles.localIndicator}>
          <span />
          {text.local}
        </span>
      </header>
      {view.showWelcome && (
        <section
          className={styles.welcomeBanner}
          aria-label="Welcome to AI Agent Showcase"
        >
          <Icon name="spark" size={22} />
          <div>
            <strong>{text.visitorWelcome}</strong>
            <p>{text.visitorWelcomeBody}</p>
          </div>
          <button
            className={styles.welcomeDismiss}
            aria-label="Dismiss welcome"
            onClick={client.dismissWelcome}
          >
            <Icon name="close" size={18} />
          </button>
        </section>
      )}
      {view.error && (
        <div
          data-testid="workspace-error"
          className={styles.errorBanner}
          role="alert"
        >
          <span>{view.error}</span>
          {view.loadError ? (
            <button
              onClick={() => {
                if (confirm(text.resetConfirm)) void client.reset();
              }}
            >
              {text.reset}
            </button>
          ) : (
            <button aria-label="Dismiss error" onClick={client.clearError}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      )}
      {view.workspace ? (
        children
      ) : (
        <main className={styles.loading}>
          {view.loadError ? "Unable to load saved data" : text.loading}
        </main>
      )}
    </div>
  );
}
