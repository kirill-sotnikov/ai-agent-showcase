"use client";

import { useAppStore } from "../stores/app-store-context";
import * as styles from "./service-status.css";

export const ServiceStatus = () => {
  const connection = useAppStore((state) => state.connection);
  const health = useAppStore((state) => state.health);
  const error = useAppStore((state) => state.error);
  const checkConnection = useAppStore((state) => state.checkConnection);

  return (
    <section className={styles.panel} aria-label="Service connection">
      <h2>Service connection</h2>
      <p role="status" aria-live="polite">
        {connection === "idle" && "Ready to check the service."}
        {connection === "checking" && "Checking the service..."}
        {connection === "connected" &&
          health &&
          `Connected: ${health.client} received status ${health.status}.`}
        {connection === "error" && error}
      </p>
      <button
        className={styles.button}
        type="button"
        disabled={connection === "checking"}
        onClick={() => {
          void checkConnection();
        }}
      >
        Check service
      </button>
    </section>
  );
};
