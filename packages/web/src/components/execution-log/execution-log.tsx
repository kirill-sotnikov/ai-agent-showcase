import * as styles from "../../styles.css";
import { useEffect, useRef } from "react";
import type {
  PersistedState,
  ServerEvent,
  WorkflowAgent,
} from "@shop/shared/contracts";
import { text } from "../../ui/text";

const agentNames: Record<WorkflowAgent, string> = {
  orchestrator: "Orchestrator",
  guard: "Guard",
  router: "Router",
  knowledge: "Knowledge",
  action: "Action",
  composer: "Composer",
};

function formatEvent(event: ServerEvent, userMessage?: string): string | null {
  if (
    [
      "assistant.delta",
      "assistant.message",
      "cart.proposed",
      "cart.committed",
      "clarification.required",
    ].includes(event.type)
  )
    return null;

  const { payload } = event;

  const time = new Date(event.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
  });

  const parts = [`[${time}]`, `[${event.requestId.slice(0, 8)}]`];

  if ("agent" in payload && payload.agent)
    parts.push(`[agent=${agentNames[payload.agent]}]`);
  else if (event.type === "request.accepted")
    parts.push("[agent=Orchestrator]");

  parts.push(event.type);

  if (event.type === "request.accepted" && userMessage !== undefined)
    parts.push(`Received request from user ${userMessage}`);
  if ("label" in payload) parts.push(payload.label);
  if ("durationMs" in payload && payload.durationMs !== undefined)
    parts.push(`(${Math.round(payload.durationMs)} ms)`);
  if ("outcome" in payload) parts.push(`outcome=${payload.outcome}`);
  if ("cartStatus" in payload) parts.push(`cart=${payload.cartStatus}`);
  if ("error" in payload && payload.error)
    parts.push(`${payload.error.code}: ${payload.error.message}`);

  let line = parts.join(" ");

  if ("details" in payload && payload.details)
    line += `\n  ${JSON.stringify(payload.details)}`;

  return event.type === "request.accepted" ? `\n${line}` : line;
}

export function ExecutionLog({ state }: { state: PersistedState }) {
  const userMessages = new Map(
    state.messages
      .filter((message) => message.role === "user")
      .map((message) => [message.requestId, message.content]),
  );

  const output = state.executionHistory
    .map((event) => formatEvent(event, userMessages.get(event.requestId)))
    .filter((line) => line !== null)
    .join("\n");

  const terminal = useRef<HTMLPreElement>(null);
  const followOutput = useRef(true);

  useEffect(() => {
    if (terminal.current && followOutput.current)
      terminal.current.scrollTop = terminal.current.scrollHeight;
  }, [output]);

  return (
    <section
      className={`${styles.panel} ${styles.logPanel}`}
      aria-label="Execution logs"
    >
      <div className={styles.compactHeading}>
        <div className={styles.headingLabel}>
          <h2>{text.logs}</h2>
        </div>
      </div>
      <pre
        ref={terminal}
        className={styles.logScroll}
        role="log"
        aria-label="Workflow output"
        tabIndex={0}
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;

          followOutput.current = scrollHeight - scrollTop - clientHeight < 24;
        }}
      >
        {output || text.emptyLogs}
      </pre>
    </section>
  );
}
