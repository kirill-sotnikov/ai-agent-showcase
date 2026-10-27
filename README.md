# AI Agent Showcase

Yarn monorepo with a Next.js app (vanilla-extract, Zustand) and a Fastify service (tRPC, Zod). Requires Node.js 24 or newer and Yarn 4.18.1 (pinned in `packageManager`).

## Setup

```sh
corepack enable
yarn install
yarn dev
```

If the global `yarn` command still uses Yarn Classic, use `corepack yarn` in its place.

- App: http://localhost:3000 (`packages/app`, Next.js App Router).
- Service: http://127.0.0.1:3001 (`packages/service`, Fastify).
- Health check: `GET http://127.0.0.1:3001/health` returns `{"status":"ok"}`.

The service reads optional `HOST` and `PORT` values from `.env` in the repository root. Copy `.env.example` to `.env` to override the defaults. The app runs on port 3000.

## Commands

| Command             | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `yarn dev`          | Run both workspaces with watch mode                 |
| `yarn build`        | Build both workspaces                               |
| `yarn start`        | Run both production builds (run `yarn build` first) |
| `yarn typecheck`    | Check both workspaces with TypeScript               |
| `yarn lint`         | Run ESLint with zero allowed warnings               |
| `yarn lint:fix`     | Apply ESLint fixes                                  |
| `yarn format`       | Format files with Prettier                          |
| `yarn format:check` | Check formatting                                    |
| `yarn check`        | Run type checking, linting, and production builds   |

Run a single workspace with `yarn workspace app dev` or `yarn workspace service dev`.

ESLint and Prettier follow the `/Users/kirillsotnikov/projects/2drop` setup, including Canonical, Next.js rules, import sorting, unused imports, and the custom rules in `eslint/`. Configuration paths are adapted to `packages/*`.

## Styling, state, and API

- Styles live in `*.css.ts` files and compile to CSS through the vanilla-extract Next.js plugin. Development and builds use Webpack.
- Zustand stores are created inside `AppStoreProvider` for each rendered app tree, avoiding shared state between server requests. Client components use `useAppStore(selector)`.
- The backend router is in `packages/service/src/router.ts`. Zod validates procedure input/output and service environment variables.
- `service/router` exports only the `AppRouter` type. The app imports it through the `service` workspace dependency; `RouterInputs` and `RouterOutputs` in `packages/app/src/lib/trpc.ts` are inferred automatically. Router edits are picked up by TypeScript directly from source, without generating declarations or building the service first. Backend runtime code is excluded from the browser bundle.
- The browser calls `/api/trpc` using the typed tRPC client. Next.js proxies requests to the service's `/trpc` endpoint, so no cross-origin configuration is needed. To change the backend address, copy `packages/app/.env.example` to `packages/app/.env.local` and set `SERVICE_URL` before starting development or building for production. If the service `PORT` changes, update `SERVICE_URL` accordingly.
- Click **Check service** on the starter page to exercise the client, proxy, Zod-validated procedure, and Zustand connection state.

A typed request looks like this:

```ts
import { createApiClient } from "./lib/trpc";

const api = createApiClient();
const result = await api.health.query({ client: "app" });
// result is inferred from the backend: { status: "ok"; client: string }
```
