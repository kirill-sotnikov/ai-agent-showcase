# AI Shopping Assistant

A two-page shopping demo with an editable catalog and identity, a conversational cart, and a live execution viewer. React + TypeScript + CSS, Fastify, WebSocket, Zod, and the OpenAI JavaScript SDK. User state lives in one versioned localStorage document; the server has no database.

## Run locally

Requires Node.js 24+ and Yarn 4.18.1, pinned in `packageManager`.

```sh
corepack enable
corepack yarn install --immutable
corepack yarn dev:fake
```

Open [localhost:3000](http://localhost:3000). `dev:fake` needs no API key and is restricted to development. It uses a deterministic English parser for reproducible examples, not a general language model. Edit sources and reload the browser; esbuild watches both workspaces and Node restarts the server when its bundle changes. No frontend dev server or proxy is involved.

Try `Find a lamp under $50 and add the cheapest one.`, `Add two of the blue mugs.`, and `Remove one blue mug.` Settings contains the identity editor and catalog CRUD.

For real OpenAI requests:

```sh
cp .env.example .env
# Set OPENAI_API_KEY and OPENAI_MODEL in .env; keep LLM_PROVIDER=openai.
corepack yarn dev
```

Use the exact model name you intend to evaluate. Every role uses `OPENAI_MODEL`; no model is hardcoded. All requests disable reasoning with `reasoning.effort: "none"`; choose a model that supports this setting. `/ready` checks configuration without a paid API call. Missing configuration returns HTTP 503 with an English explanation and disables Send. Actual structured-output/tool-calling support must be verified against that model using live evaluations.

## Commands

| Command             | Purpose                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `yarn dev`          | Watch client/server, load server `.env`, run on port 3000             |
| `yarn dev:fake`     | Same workflow with a development-only fake provider                   |
| `yarn build`        | Bundle the React client and server using esbuild                      |
| `yarn start`        | Load server `.env` and serve the production bundles                   |
| `yarn typecheck`    | Check all application, shared and test TypeScript                     |
| `yarn lint`         | ESLint, TypeScript and React Hooks checks                             |
| `yarn format:check` | Check Prettier formatting                                             |
| `yarn test`         | Unit tests and real HTTP/WebSocket integration tests                  |
| `yarn test:e2e`     | Chromium browser scenarios; builds and starts an isolated fake server |
| `yarn eval:fake`    | Run the 34-case deterministic evaluation dataset                      |
| `yarn eval:live`    | Run explicitly budgeted live OpenAI evaluations                       |
| `yarn check`        | Typecheck, lint, unit/integration tests, build                        |

Install the browser once with `yarn playwright install chromium`. On Linux use `yarn playwright install --with-deps chromium`.

## Architecture

```text
apps/web         React SPA: / and /settings, storage, locks, WebSocket client
apps/server      Fastify HTTP/WebSocket, orchestrator, providers, gateway, Pino logging
packages/contracts  Strict Zod domain, persistence and protocol schemas
packages/domain     Catalog retrieval, draft cart operations, money, validation
```

Fastify serves `/`, `/settings`, `/assets/*`, `/ws`, `/health`, and `/ready`. Both development and production use one origin. The browser build includes only React, contracts, domain functions and client code. Vite is used by Vitest as a **test dependency**; the application is developed and built with esbuild and has no Vite config, server, proxy or runtime dependency. The previous Next.js/tRPC starter has been replaced.

The workflow moves through guard → router → knowledge/action tools → validation → optional proposal/ACK → verified response. Mixed requests retrieve and choose before applying dependent draft operations. Knowledge tools cannot write. Tool schemas are validated again in the gateway; quantity limits, product IDs, integer money and the operation chain are checked in code. `choose_cheapest` calculates its selection in code. English prompts are versioned under `apps/server/src/ai/prompts/v1`.

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

| Variable                          | Default / purpose                                      |
| --------------------------------- | ------------------------------------------------------ |
| `HOST`, `PORT`                    | `127.0.0.1`, `3000`                                    |
| `NODE_ENV`                        | `development`; fake provider is rejected in production |
| `LLM_PROVIDER`                    | `openai`; `fake` is available in dev/test              |
| `OPENAI_API_KEY`, `OPENAI_MODEL`  | Required for real requests                             |
| `ALLOWED_ORIGINS`                 | Comma-separated exact permitted browser origins        |
| `REQUEST_DEADLINE_MS`             | `60000`                                                |
| `LLM_TIMEOUT_MS`                  | `20000` per SDK call                                   |
| `ACK_TIMEOUT_MS`                  | `5000`                                                 |
| `MAX_CONCURRENT_RUNS`             | `8` process-wide                                       |
| `MAX_LLM_CALLS`, `MAX_TOOL_CALLS` | `8`, `12` per request                                  |
| `MAX_OUTPUT_TOKENS`               | `1500` per SDK call                                    |

Frames are limited to 1 MiB, socket send buffers to 256 KiB, starts to 20/minute/IP, commands to 120/minute/connection and connections to 100. WebSocket Origin is checked, heartbeat detects dead peers, shutdown aborts active work. Pino logs contain correlation and outcomes without snapshots or provider payloads. Pino emits request IDs, workflow stages, tool names, stable error codes, durations, model versions and token usage to stdout. Prometheus, Grafana, external trace exporters and GitHub CI/CD are outside this project.

Production:

```sh
yarn build
# Configure .env: NODE_ENV=production, LLM_PROVIDER=openai, keys and exact HTTPS origin.
yarn start
```

Use a TLS reverse proxy with WebSocket upgrade support; `deployment/nginx.conf.example` is a starting configuration. Proxy deployments currently share an IP rate-limit bucket because the server deliberately does not trust forwarded IP headers. Configure provider spending limits and host resource limits before public exposure.

Smoke test: `/health` → `/ready` → connect to `/ws` → search → add a unique product → see `Cart saved` → reload and verify its quantity remains unchanged. `yarn test:e2e` automates this with the fake provider.

## Evaluations and delivery status

The dataset at `tests/evals/datasets/shopping-v1.json` covers 34 cases: retrieval, prices, mixed actions, repeated adds, remove/set, ambiguity, short clarification, missing specs, empty catalogs, injection data, invalid routing, provider failure, commit rejection and composer failure. Deterministic evaluation reports go to `tests/evals/results/fake-latest.json`. These results measure fixture behavior and invariants; they are not evidence of real model accuracy.

Live evaluations require server credentials and explicit cost parameters:

```dotenv
EVAL_MAX_CASES=5
EVAL_MAX_USD=your-budget
EVAL_INPUT_USD_PER_MILLION=verified-model-input-price
EVAL_OUTPUT_USD_PER_MILLION=verified-model-output-price
```

Run `yarn eval:live`. It records the configured model, prompt version, usage, estimated cost, outcomes and timings in `tests/evals/results/live-latest.json`. Cost reservation is conservative and may skip cases; increase the explicit budget only after reviewing the model's actual prices. Missing credentials produce an explicit skipped report. No live evaluation has been run as part of this implementation because server credentials and a chosen model were not supplied.

All verification commands run locally through Yarn. No GitHub Actions or GitHub CI/CD configuration is included. Set release quality and cost thresholds after a measured live baseline; no real-model accuracy claim has been made.

See `IMPLEMENTATION_STATUS.md` for verification results and remaining release work. Source documentation was consulted through Context7 for Fastify WebSocket, Zod, OpenAI SDK and Playwright; OpenAI behavior was also checked against the [structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs) and [function-calling guide](https://developers.openai.com/api/docs/guides/function-calling).
