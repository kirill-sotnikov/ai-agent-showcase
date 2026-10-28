# AI Shopping Assistant

A two-page shopping demo with an editable catalog and identity, a conversational cart, and a live execution viewer. Next.js App Router + TypeScript + vanilla-extract + Zustand, Fastify, WebSocket, Zod, and the OpenAI JavaScript SDK. User state lives in one versioned localStorage document; the server has no database.

## Run locally

Requires Node.js 24+ and Yarn 4.18.1, pinned in `packageManager`.

```sh
corepack enable
corepack yarn install --immutable
corepack yarn dev:fake
```

Open [localhost:3000](http://localhost:3000). `dev:fake` needs no API key and is restricted to development. It uses a deterministic English parser for reproducible examples, not a general language model. Next.js provides Fast Refresh for the frontend on port 3000; Node watches the Fastify sources on port 3001. Next.js proxies `/ws`, `/health`, and `/ready` to Fastify, so the browser keeps one origin.

Try `Find a lamp under $50 and add the cheapest one.`, `Add two of the blue mugs.`, and `Remove one blue mug.` Settings contains the identity editor and catalog CRUD.

For real OpenAI requests:

```sh
cp .env.example .env
# Set OPENAI_API_KEY and OPENAI_MODEL in .env; keep LLM_PROVIDER=openai.
corepack yarn dev
```

Use the exact model name you intend to evaluate. Every role uses `OPENAI_MODEL`; no model is hardcoded. All requests disable reasoning with `reasoning.effort: "none"`; choose a model that supports this setting. `/ready` checks configuration without a paid API call. Missing configuration returns HTTP 503 with an English explanation and disables Send. Actual structured-output/tool-calling support must be verified against that model using live evaluations.

## Commands

| Command              | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `yarn dev`           | Run Next.js and Fastify in parallel                                   |
| `yarn dev:service`   | Watch Fastify on port 3001, load root `.env`                          |
| `yarn dev:fake`      | Run both apps with a development-only fake provider                   |
| `yarn build`         | Build Next.js (Webpack) and the Fastify esbuild bundle                |
| `yarn start`         | Start Next.js and Fastify in parallel                                 |
| `yarn start:service` | Start the Fastify production bundle, load root `.env`                 |
| `yarn typecheck`     | Check all application, shared and test TypeScript                     |
| `yarn lint`          | ESLint, TypeScript and React Hooks checks                             |
| `yarn format:check`  | Check Prettier formatting                                             |
| `yarn test`          | Unit tests and real HTTP/WebSocket integration tests                  |
| `yarn test:e2e`      | Chromium browser scenarios; builds and starts an isolated fake server |
| `yarn eval:fake`     | Run 34 deterministic scenarios through Promptfoo                      |
| `yarn eval:live`     | Run budgeted live OpenAI scenarios through Promptfoo                  |
| `yarn eval:view`     | Open the local Promptfoo UI with evaluation history                   |
| `yarn check`         | Typecheck, lint, unit/integration tests, build                        |

Install the browser once with `yarn playwright install chromium`. On Linux use `yarn playwright install --with-deps chromium`.

## Architecture

```text
packages/web      Next.js App Router: / and /settings
  src/app         Route entries, metadata and persistent root layout
  src/components  Shell, assistant, settings, chat, cart, catalog, logs and UI
  src/workspace.tsx Per-provider Zustand store and browser lifecycle
  src/styles.css.ts vanilla-extract theme, scoped styles and responsive rules
  src/storage     Versioned localStorage transactions and Web Locks
  src/transport   WebSocket protocol and run lifecycle
packages/service  Fastify HTTP/WebSocket, orchestrator, providers, gateway, Pino logging
  src/domain      Server-only catalog retrieval and draft cart operations
packages/shared   Shared code used by both applications
  src/contracts   Strict Zod domain, persistence and protocol schemas
  src/domain      Cart operations, invariants, fingerprints and proposal validation
  src/defaults.ts Initial catalog and agent identity
  src/money.ts    Money formatting
```

Shared modules are imported through `@shop/shared/contracts`, `@shop/shared/domain`, `@shop/shared/defaults`, and `@shop/shared/money`. Catalog and draft cart services stay inside the server.

Next.js serves pages and assets and forwards `/ws`, `/health`, and `/ready` to Fastify. Both development and production use one browser origin. The Zustand store is created per root provider and hydrates from localStorage after mount; client-side navigation preserves the connection and active request. Existing persistence validation, atomic receipts and cross-tab Web Locks remain the source of truth for saved data. vanilla-extract compiles `.css.ts` into CSS through its Next.js plugin; both dev and production use Webpack. Pages render dynamically so Next.js scripts receive a fresh CSP nonce. The browser build contains no provider credentials or server code. Vite is used only by Vitest.

Integration follows the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [vanilla-extract Next.js](https://vanilla-extract.style/documentation/integrations/next/), and [Zustand Next.js](https://zustand.docs.pmnd.rs/learn/guides/nextjs) guides.

The workflow moves through guard → router → knowledge/action tools → validation → optional proposal/ACK → verified response. Mixed requests retrieve and choose before applying dependent draft operations. Knowledge tools cannot write. Tool schemas are validated again in the gateway; quantity limits, product IDs, integer money and the operation chain are checked in code. `choose_cheapest` calculates its selection in code. English prompts are versioned under `packages/service/src/ai/prompts/v1`.

The OpenAI adapter supports structured responses, bounded function-call loops, streaming, usage and AbortSignal. Server-side streaming is assembled and validated before display. Product facts are rendered from retrieved catalog fields; model output selects a constrained presentation rather than supplying unrestricted product claims. No hidden reasoning or raw provider output is sent to Logs.

## Persistence and recovery

One key, `ai-shopping-assistant:v1`, contains settings, products, cart, chat, execution history, active run, clarification and commit receipts. The current version is validated on every read/write. v1 is the first public format; unknown versions or corrupt JSON are preserved and require an explicit reset. There is no silent reseeding, even when the catalog is empty.

Each request owns a Web Lock for its lifetime. A second writer lock serializes read/check/write across tabs. Manual edits use the same run lock. Browsers without reliable Web Locks cannot edit; use localhost or HTTPS in a supported browser.

The commit handshake is:

1. Server proposes a complete validated cart and operation chain.
2. Client checks the active request, revision, totals and SHA-256 fingerprint.
3. One localStorage write saves cart + revision + receipt atomically.
4. Client ACKs that persisted result.
5. Server confirms success and sends the answer.

The same proposal returns its receipt without another write, even if storage later becomes unavailable. A different proposal for an already committed request fails. Before commit, cancellation or any tool error discards the entire draft. After commit, failure does not undo the cart; the receipt provides a deterministic saved-cart summary.

Reconnect restores only the transport. It never resends a command. Reload interrupts an unfinished run and checks its receipt; a saved cart remains saved even if its ACK or final response was lost. Domain edits increment revision; history updates do not. History is bounded to 100 messages, 30 request groups and 100 receipts, retaining the current receipt.

localStorage is per origin and browser, readable by scripts on that origin, and can be cleared by the user. This demo has no account synchronization, immutable audit trail or distributed exactly-once guarantee. Moving to another origin creates a separate workspace. Currency is USD in this version.

## Server configuration and operations

`.env` is ignored by Git. `.env.example` contains placeholders only. Keys are never sent to the browser, Logs or localStorage.

| Variable                          | Default / purpose                                       |
| --------------------------------- | ------------------------------------------------------- |
| `HOST`, `PORT`                    | Fastify listen address: `127.0.0.1`, `3001`             |
| `WEB_PORT`                        | Next.js listen port for root dev/start commands: `3000` |
| `SERVICE_URL`                     | Next.js upstream: `http://127.0.0.1:3001`               |
| `NODE_ENV`                        | `development`; fake provider is rejected in production  |
| `LLM_PROVIDER`                    | `openai`; `fake` is available in dev/test               |
| `OPENAI_API_KEY`, `OPENAI_MODEL`  | Required for real requests                              |
| `ALLOWED_ORIGINS`                 | Comma-separated exact permitted browser origins         |
| `REQUEST_DEADLINE_MS`             | `60000`                                                 |
| `LLM_TIMEOUT_MS`                  | `20000` per SDK call                                    |
| `ACK_TIMEOUT_MS`                  | `5000`                                                  |
| `MAX_CONCURRENT_RUNS`             | `8` process-wide                                        |
| `MAX_LLM_CALLS`, `MAX_TOOL_CALLS` | `8`, `12` per request                                   |
| `MAX_OUTPUT_TOKENS`               | `1500` per SDK call                                     |

Frames are limited to 1 MiB, socket send buffers to 256 KiB, starts to 20/minute/IP, commands to 120/minute/connection and connections to 100. WebSocket Origin is checked, heartbeat detects dead peers, shutdown aborts active work. Pino logs contain correlation and outcomes without snapshots or provider payloads. Pino emits request IDs, workflow stages, tool names, stable error codes, durations, model versions and token usage to stdout. Prometheus, Grafana, external trace exporters and GitHub CI/CD are outside this project.

Production:

```sh
yarn build
# Configure .env: NODE_ENV=production, LLM_PROVIDER=openai, keys and exact HTTPS origin.
yarn start
```

Point a TLS reverse proxy with WebSocket upgrade support at Next.js. Fastify defaults to loopback; its `dev` and `start` commands load the root `.env`. The root `dev` and `start` commands use Yarn’s native parallel tasks to run the corresponding command in both workspaces. Use `yarn dev:web` / `yarn dev:service` or `yarn start:web` / `yarn start:service` to run one workspace separately. Next.js uses port 3000 by default; override it with `WEB_PORT=3200 yarn dev` or `WEB_PORT=3200 yarn start`. If an existing root `.env` still has `PORT=3000`, change it to `PORT=3001` for Fastify. `SERVICE_URL` is compiled into Next.js rewrites: when changing the upstream, set it to the same value for `yarn build` and startup; `PORT` controls Fastify. For example, use `SERVICE_URL=http://127.0.0.1:3201 yarn build`, then run `PORT=3201 SERVICE_URL=http://127.0.0.1:3201 yarn start`. Proxy deployments currently share an IP rate-limit bucket because the server deliberately does not trust forwarded IP headers. Configure provider spending limits and host resource limits before public exposure.

Smoke test: `/health` → `/ready` → connect to `/ws` → search → add a unique product → see `Cart saved` → reload and verify its quantity remains unchanged. `yarn test:e2e` automates this with the fake provider.

## Evaluations and delivery status

Evaluations use **Promptfoo 0.125.1** through its TypeScript SDK. No YAML configuration is required. Run `yarn eval:fake` for the 34 deterministic scenarios, then `yarn eval:view` to inspect results and compare saved runs in the local UI (port 15500). Evaluation history, logs and the database live in the ignored `.promptfoo/` directory; telemetry and update checks are disabled by the project commands. Reports also export to `tests/evals/results/fake-latest.json` and `live-latest.json` in Promptfoo's native format. These results measure fixture behavior and invariants; fake runs are not evidence of real model accuracy.

The evaluation sources are:

- `tests/evals/datasets/shopping-v1.ts`: typed inputs, initial cart/clarification fixtures, fault injection and expected results. Add or edit scenarios here.
- `tests/evals/harness.ts`: an adapter that creates fresh state and a provider per scenario, runs the real workflow, and collects the cart, rendered product IDs, messages, errors, tool names, timings and token usage.
- `tests/evals/assertions.ts`: reusable TypeScript assertion functions with named metrics and failure explanations. They check outcome, exact cart contents, persistence status and confirmation order, clarification questions, expected search results, missing specifications and error codes. No LLM judge is used.
- `tests/evals/suite.ts`: Promptfoo provider and test configuration. Cases are tagged as `behavior` or `resilience` (injected faults), with model and prompt version metadata.

The scenarios cover retrieval, prices, mixed actions, repeated adds, remove/set, ambiguity, short clarification, missing specs, empty catalogs, injection data, invalid routing, provider failure, commit rejection and composer failure. Calls run sequentially with caching disabled so each evaluation executes the workflow again. A failed assertion or execution error makes the command exit nonzero. Rerun evaluations using the project commands; inline TypeScript functions are not replayable from the exported JSON alone.

Live evaluations require server credentials and explicit cost parameters:

```dotenv
EVAL_MAX_CASES=5
EVAL_MAX_USD=your-budget
EVAL_INPUT_USD_PER_MILLION=verified-model-input-price
EVAL_OUTPUT_USD_PER_MILLION=verified-model-output-price
```

Set these numeric values in `.env` alongside `OPENAI_API_KEY` and `OPENAI_MODEL`, then run `yarn eval:live`. Prices are USD per million tokens, such as `0.1`, without a dollar sign. `EVAL_MAX_CASES` defaults to 5 and selects the first cases (up to 50; the current dataset has 34). For a one-case smoke run use `EVAL_MAX_CASES=1 yarn eval:live`. The server and frontend do not need to be running.

To rerun specific scenarios, pass comma-separated IDs, for example `yarn eval:live --cases price-filter,set-zero,pending-short-reply`. Unknown or empty IDs fail before any model calls. The case limit and cost budget still apply to the selected scenarios. Filtered runs export to `tests/evals/results/live-selected.json` (or `fake-selected.json`) so the full-run report stays available. Use `--output path/to/report.json` to choose a different report path.

The adapter reports total workflow token usage and estimated cost to Promptfoo. The existing conservative budget check reserves `MAX_LLM_CALLS × (1,048,576 × inputPrice + MAX_OUTPUT_TOKENS × outputPrice) / 1,000,000` USD before each scenario, in addition to previously recorded cost. This is a reservation, not an expected bill. A budget-blocked scenario appears as a Promptfoo execution error with `metadata.skipped=true` and does not call the model. Missing credentials write an explicit skipped report. Both conditions exit nonzero. Review your model's prices before increasing the budget; cost estimates use the configured input/output rates and do not model every billing adjustment.

The migration was verified with the fake provider and local regression tests; no paid live evaluation was run during migration.

All verification commands run locally through Yarn. No GitHub Actions or GitHub CI/CD configuration is included. Set release quality and cost thresholds after a measured live baseline; no real-model accuracy claim has been made.

See `IMPLEMENTATION_STATUS.md` for verification results and remaining release work. Source documentation was consulted through Context7 for Fastify WebSocket, Zod, OpenAI SDK and Playwright; OpenAI behavior was also checked against the [structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs) and [function-calling guide](https://developers.openai.com/api/docs/guides/function-calling).
