import type React from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { isRunning } from "./storage/store";
import { client } from "./workspace";
import { Icon } from "./ui/icon";
import { text } from "./ui/text";
import { Chat } from "./features/chat/chat";
import { Cart } from "./features/cart/cart";
import { ExecutionLog } from "./features/execution-log/execution-log";
import { Settings } from "./pages/settings";
import "./styles.css";

function App() {
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [page, setPage] = useState(location.pathname);
  useEffect(() => {
    void client.initialize();
    const pop = () => setPage(location.pathname);
    window.addEventListener("popstate", pop);
    return () => {
      client.dispose();
      window.removeEventListener("popstate", pop);
    };
  }, []);
  const navigate = (
    event: React.MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    history.pushState(null, "", path);
    setPage(path);
  };
  const busy = view.workspace ? isRunning(view.workspace) : false;
  const disabled = busy || !navigator.locks;
  const act = (operation: () => Promise<unknown>) => {
    client.clearError();
    void operation().catch((error) => client.report(error));
  };
  return (
    <>
      <header className="app-header">
        <a className="brand" href="/" onClick={(event) => navigate(event, "/")}>
          <span className="brand-mark">
            <Icon name="bag" />
          </span>
          <span>
            {text.brand}
            <small>YOUR PERSONAL SHOPPING ASSISTANT</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a
            href="/"
            className={page === "/" ? "active" : ""}
            aria-current={page === "/" ? "page" : undefined}
            onClick={(event) => navigate(event, "/")}
          >
            <Icon name="spark" size={17} />
            {text.assistant}
          </a>
          <a
            href="/settings"
            className={page === "/settings" ? "active" : ""}
            aria-current={page === "/settings" ? "page" : undefined}
            onClick={(event) => navigate(event, "/settings")}
          >
            <Icon name="settings" size={17} />
            {text.settings}
          </a>
        </nav>
        <span className="local-indicator">
          <span />
          {text.local}
        </span>
      </header>
      {view.error && (
        <div className="error-banner" role="alert">
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
      {!view.workspace ? (
        <main className="loading">
          {view.loadError ? "Unable to load saved data" : text.loading}
        </main>
      ) : page === "/settings" ? (
        <Settings state={view.workspace} disabled={disabled} act={act} />
      ) : (
        <main className="assistant-grid">
          <section className="panel chat-panel" aria-label="Assistant chat">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">LET’S FIND YOUR NEXT FAVORITE</span>
                <h1>{text.assistant}</h1>
              </div>
              <div className="connection" role="status">
                <span
                  className={
                    view.connection === "Connected" ? "dot online" : "dot"
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
            <div className="chat-footnote">
              <span className="dot online" />
              {view.provider === "fake" ? text.fake : text.openai}
              <span>Catalog facts. Verified cart changes.</span>
            </div>
          </section>
          <div className="right-panels">
            <Cart
              state={view.workspace}
              disabled={disabled}
              act={act}
              pending={!!view.pending}
            />
            <ExecutionLog state={view.workspace} />
          </div>
        </main>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
