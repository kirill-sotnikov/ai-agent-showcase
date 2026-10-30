# AI Agent Showcase

An AI shopping assistant that searches the catalog, answers product questions, and manages a cart through conversation. The project demonstrates the full lifecycle of an agent application — from intent detection and tool calls to saving results and evaluating quality with Promptfoo.

The interface includes a chat, a shopping cart, and an execution log showing request stages and tool calls. The settings page lets you edit the catalog and the assistant's profile.

![AI Shopping Assistant: chat, cart, and execution log](docs/screenshots/app.png)

## Architecture

The project is a TypeScript monorepo with three packages:

| Package            | Purpose                                     | Technologies                             |
| ------------------ | ------------------------------------------- | ---------------------------------------- |
| `packages/web`     | Interface, user state, and WebSocket client | Next.js, React, Zustand, vanilla-extract |
| `packages/service` | Server, AI orchestrator, and tools          | Fastify, WebSocket, OpenAI SDK           |
| `packages/shared`  | Shared contracts and cart rules             | Zod, TypeScript                          |

The browser connects to Next.js, which proxies WebSocket requests to Fastify. The server runs the AI workflow and sends events to the execution log. The catalog, cart, settings, and history are stored in `localStorage`; the server has no database. The OpenAI key is used only on the server.

### AI Agent

The orchestrator starts Guard and Router in parallel, each with its own prompt. Shopping tools run only after Guard allows the request and Router returns a valid route. Spam or a failed Guard check cancels pending routing; speculative routing errors cannot override a spam verdict. Guard, Router, Knowledge, and Action use the model configured in `OPENAI_MODEL`. Composer is a deterministic application function and does not call the model.

```mermaid
flowchart TD
    Request[User message] --> Guard["[AGENT] Guard: request screening"]
    Request --> Router["[AGENT] Router: intent detection"]
    Guard --> Gate{Guard allows and route is valid}
    Router --> Gate
    Gate --> Knowledge["[AGENT] Knowledge: questions and conversation"]
    Gate --> Action["[AGENT] Action: commands and mixed requests"]
    Knowledge --> ReadTools["[TOOL] Optional catalog and cart reads"]
    ReadTools --> Answer[Natural answer + showCart]
    Answer --> Validation[Validate product references]
    Action --> CartTools["[TOOL] Search and update cart draft"]
    CartTools --> ValidateCart[Validate result and proposal]
    ValidateCart -->|Cart changed| Commit[Save in browser and ACK]
    ValidateCart -->|Unchanged| ActionAnswer["[AGENT] Action: write final answer"]
    Commit --> ActionAnswer
    Validation --> Composer["Composer: application function, no LLM"]
    ActionAnswer -->|showCart always true| Composer
    Composer --> Response[Response to user]
```

`[AGENT]` marks an LLM agent; `[TOOL]` marks a group of tools available to the agent. Unmarked processing nodes run in application code, including Composer.

| Role          | Responsibility                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guard**     | Screens messages for spam using conversation context.                                                                                         |
| **Router**    | Distinguishes questions, commands, mixed requests, and out-of-scope messages. Greetings and capability questions go to Knowledge.             |
| **Knowledge** | Writes a natural-language answer, optionally using read tools. Chooses whether the answer should include the cart.                            |
| **Action**    | Retrieves products, stages changes, and answers mixed requests. Writes the final response after validation and, for changes, persistence ACK. |
| **Composer**  | Validates and forwards the text and optionally attaches a cart view. Runs in application code with no model call.                             |

Read tools: `search_products`, `get_product`, `get_cart`, `choose_cheapest`. Cart changes use `add_to_cart`, `set_cart_quantity`, and `remove_from_cart`. Search uses keywords and filters; the lowest-price selection is calculated in code.

The model selects tools through function calling and returns structured results. The tool gateway validates arguments with Zod, enforces role permissions, and limits tool calls. Before changing a product's cart quantity, the agent must retrieve it from the catalog. Prompts are versioned in [`packages/service/src/ai/prompts/v1`](packages/service/src/ai/prompts/v1).

Agents are instructed to ground their prose in retrieved data, answer the actual question, and disclose missing specifications. The orchestrator validates referenced product IDs, tool permissions, and cart proposals; it does not mechanically verify every claim in free-form text. Response-quality evaluations therefore check answer content as well as execution. Price minima computed by `choose_cheapest` apply to the retrieved candidate set; the current search returns at most ten matches, so a partial result must not be described as a global minimum.

## Quality Evaluation with Promptfoo

**Promptfoo** is integrated through its TypeScript SDK. It runs scenarios through the actual orchestrator and tool gateway, collects results, and lets you compare runs in a local interface.

The suite contains **40 scenarios** covering search and price filtering, lowest-price selection, cart changes, clarifications, missing specifications, an empty catalog, prompt injection, failures at different workflow stages, text-only greetings and capability answers, focused attribute questions, cart visibility, and conversational price comparisons.

Assertions are written in TypeScript. They check the final cart, referenced products, answer content, cart visibility, unnecessary tool calls, clarifications, error codes, and the order of persistence confirmations. Unit and SDK integration tests also verify that questions skip the former Composer model call and Action cannot hide the cart. Browser tests cover text-only answers and cart snapshots across edits and reloads. Reports also include tool calls, execution time, token usage, and estimated cost for the real model.

```sh
# Run evaluations
yarn eval:live

# Open run history and results
yarn eval:view
```

![Promptfoo evaluation results and scenario assertions](docs/screenshots/promptfoo.png)

Promptfoo history is stored locally in `.promptfoo/`, and JSON reports are saved to `tests/evals/results/`. Execution errors and failed assertions cause the command to exit with a nonzero code.

## Getting Started

Requires **Node.js 24+** and **Yarn 4.18.1** (pinned in `package.json`).

```sh
corepack enable
corepack yarn install --immutable
cp .env.example .env
```

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`, then start the application:

```sh
yarn dev
```

Open [localhost:3000](http://localhost:3000). Fastify runs on port `3001`. The model must support structured outputs, function calling, and `reasoning.effort: "none"`, which is set in the adapter.

To try the application without an API key:

```sh
yarn dev:fake
```

This mode uses a deterministic parser for English requests and is available for development and testing. Examples:

- `Find a lamp under $50 and add the cheapest one.`
- `Add two of the blue mugs.`
- `Remove one blue mug.`

Other server settings and optional Telegram notification settings are listed in [`.env.example`](.env.example).

## Checks and Build

```sh
# Type checking, linting, unit/integration tests, and build
yarn check

# Install the browser for E2E tests
yarn playwright install chromium

# Browser scenarios
yarn test:e2e

# Start the built application
yarn start
```
