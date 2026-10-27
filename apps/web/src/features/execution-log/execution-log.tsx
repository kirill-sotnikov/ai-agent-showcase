import { useEffect, useRef } from "react";
import type { PersistedState, ServerEvent } from "@shop/contracts";
import { Icon } from "../../ui/icon";
import { statuses, text } from "../../ui/text";

export function ExecutionLog({ state }: { state: PersistedState }) {
  const groups = new Map<string, ServerEvent[]>();
  for (const event of state.executionHistory) {
    const group = groups.get(event.requestId) ?? [];
    group.push(event);
    groups.set(event.requestId, group);
  }
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [state.executionHistory.length]);
  return (
    <section className="panel log-panel" aria-label="Execution logs">
      <div className="compact-heading">
        <div className="heading-label">
          <Icon name="activity" />
          <h2>{text.logs}</h2>
        </div>
        <span className="live-badge">
          <span className="dot online" />
          LIVE WORKFLOW
        </span>
      </div>
      <div className="log-scroll">
        {groups.size === 0 ? (
          <div className="empty-logs">
            <div className="log-decoration">
              <span />
              <span />
              <span />
            </div>
            <h3>{text.emptyLogs}</h3>
            <p>{text.emptyLogsBody}</p>
          </div>
        ) : (
          [...groups].map(([requestId, events]) => (
            <div className="log-group" key={requestId}>
              <div className="log-group-title">
                <span>REQUEST {requestId.slice(0, 8).toUpperCase()}</span>
                <time>
                  {new Date(events[0].timestamp).toLocaleTimeString("en-US", {
                    hour12: false,
                  })}
                </time>
              </div>
              {events
                .filter(
                  (event) =>
                    ![
                      "assistant.delta",
                      "assistant.message",
                      "cart.proposed",
                      "cart.committed",
                      "clarification.required",
                    ].includes(event.type),
                )
                .map((event) => {
                  const payload = event.payload;
                  const label =
                    "label" in payload
                      ? payload.label
                      : event.type === "request.accepted"
                        ? "Request received"
                        : event.type === "request.completed"
                          ? "Request completed"
                          : event.type === "request.cancelled"
                            ? "Request cancelled"
                            : "Request failed";
                  const running = event.type.endsWith("started");
                  const failed = event.type === "request.failed";
                  return (
                    <details
                      className={`log-entry ${failed ? "failed" : ""}`}
                      key={event.eventId}
                    >
                      <summary>
                        <span className={`log-dot ${running ? "running" : ""}`}>
                          {running ? "·" : failed ? "!" : "✓"}
                        </span>
                        <span>{label}</span>
                        <span className="log-status">
                          {"durationMs" in payload
                            ? `${Math.round(payload.durationMs ?? 0)} ms`
                            : "outcome" in payload
                              ? statuses[payload.outcome]
                              : running
                                ? "Running"
                                : "Completed"}
                        </span>
                      </summary>
                      <div className="log-details">
                        <span>
                          Event {event.sequence} ·{" "}
                          {new Date(event.timestamp).toLocaleTimeString(
                            "en-US",
                            { hour12: false },
                          )}
                        </span>
                        {"details" in payload && payload.details && (
                          <pre>{JSON.stringify(payload.details, null, 2)}</pre>
                        )}
                        {"error" in payload && payload.error && (
                          <p>
                            {payload.error.code}: {payload.error.message}
                          </p>
                        )}
                      </div>
                    </details>
                  );
                })}
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>
    </section>
  );
}
