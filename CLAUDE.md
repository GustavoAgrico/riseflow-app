# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

RiseFlow is a 3-tier CRM/automation platform:

```
src/           → Vite + React SPA (port 3001 in dev)
server/        → Express proxy + Socket.io (port 3333)
whatsapp-server/ → Baileys WhatsApp node (port 3334, separate git repo: GustavoAgrico/riseflow-wa-server)
supabase/      → SQL migrations (run manually in dashboard) + Edge Functions
```

The Express server is the API gateway: it holds all secrets (Supabase service role key, Baileys API key, channel keys), the frontend never calls external services directly. In production Docker builds both the static `dist/` and the `/api` are served from the same Express process on port 3333.

## Running locally

```bash
# Start all three services at once (recommended)
npm run dev:all         # root — runs dev:wa + dev:server + dev (Vite) via concurrently

# Individually
npm run dev             # Vite SPA on :3001
npm run dev:server      # Express proxy on :3333 (needs server/.env)
npm run dev:wa          # Baileys on :3334 (needs whatsapp-server/.env)

# Build
npm run build           # Vite production build → dist/
```

**Critical:** `server/` and `whatsapp-server/` each load their own `.env` from their own working directory (`dotenv` uses `cwd`). Always start them from their own folders — `npm run dev:server` handles this correctly via `--prefix`.

## Required env files

**`server/.env`** (see `server/.env.example`):
- `JWT_SECRET` — any strong random string; server refuses to start without it
- `BAILEYS_URL=http://localhost:3334` / `BAILEYS_KEY` — auth to whatsapp-server
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — for flow engine and routes
- `CORS_ORIGIN=http://localhost:3001,http://localhost:3000`
- `WEBHOOK_TOKEN` — required in production, optional in dev

**`whatsapp-server/.env`**:
- `API_KEY` — must match `BAILEYS_KEY` in server/.env
- `WEBHOOK_URL` / `FLOW_WEBHOOK_URL=http://localhost:3333/api/webhook`

**`.env` (root, Vite build-time only)**:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` / `VITE_SOCKET_URL` — leave empty in prod (same-origin)

## Path aliases

All resolve to `src/`:
`@` `@components` `@pages` `@context` `@constants` `@lib` `@services` `@hooks` `@utils`

## Auth flow

1. User logs in via Supabase Auth (`AuthContext.jsx`)
2. `src/services/api.js` intercepts every axios request, calls `POST /api/auth/login` with the Supabase access token to get a proxy JWT (7-day)
3. All `/api/*` calls send `Authorization: Bearer <proxy-JWT>`
4. `server/middleware/auth.js` validates the JWT; `req.user.sub` is the Supabase user UUID
5. `server/middleware/adminOnly.js` restricts all routes to `ADMIN_EMAILS` during the current test phase

**Demo mode:** `isDemoMode` flag in `AuthContext`. Pages check it and render `MOCK_*` constants from `src/constants/config.js` instead of hitting the DB. Never write to Supabase in demo mode.

## Frontend patterns

- **Styling:** inline styles everywhere (no CSS files), dark theme, palette in `src/pages/Chat.jsx` (`C = { bg, panel, border, text, ... }`), accent `#FF6B35` (orange) and `#7C3AED` (purple). Tailwind classes only in `src/pages/Clients.jsx` and a few others.
- **State:** no Redux/Zustand — per-page `useState` + Supabase realtime subscriptions + Socket.io events
- **Global state:** `AppContext` (toasts, notifications), `AuthContext` (user, session, isDemoMode)
- **Socket.io:** `src/services/socket.js` exports a singleton. Events from server: `new_message`, `new_chat`, `connection_update`, `transfer_notification`. Frontend emits: `transfer_request`.

## Two flow builders

The codebase has two separate visual flow editors sharing the same `flows` table:

| Route | Component | DB columns |
|---|---|---|
| `/flows` `/flow-builder` | `src/pages/FlowBuilder.jsx` | `flow_data` (legacy JSON) |
| `/flows-novo` | `src/pages/Flows/` | `nodes` + `edges` columns |

The **new builder** (`/flows-novo`) is the active one. Its node types live in `src/pages/Flows/nodes/` (one file per node type). Node definitions for the palette/catalog are in `src/pages/Flows/nodes/index.js`.

The **server-side flow engine** (`server/flowEngine.js`) executes the new builder's node schema. It is triggered by every incoming message via the webhook router and handles: keyword/schedule/tag triggers → sequential action execution → pausing at `actionWaitReply` nodes (saves `flow_execution_id` on the conversation row and resumes on next inbound).

## Incoming message routing (server)

Every inbound message goes through this chain in `server/index.js`:
```
webhook (public) → aiRespond() → handleIncomingMessage() (flow engine)
```

`aiRespond` (`server/aiAttendant.js`) checks if the conversation has `ai_auto_reply=true` and handles it with the LLM; if not handled, falls through to `handleIncomingMessage`.

Multi-channel: channel is detected from the JID prefix (`tg/` → Telegram, `fb/` → Facebook/Meta, `ig/` → Instagram). The phone number goes in as-is for WhatsApp.

## Database

All SQL migrations are in `supabase/` and must be **run manually** in the Supabase dashboard (no CLI migration runner is set up). Key tables: `conversations`, `messages`, `flows`, `contacts`, `clients`, `team_members`, `team_queues`, `settings`, `niche_config`, `usage`, `activity_logs`.

The `conversations` table has: `user_id` (owner), `contact_phone`, `contact_name`, `assigned_to` (agent name string), `ai_auto_reply` (bool), `flow_id` + `flow_node_id` + `flow_vars` (flow execution state).

The `settings` table stores per-user config (AI provider/keys, Evolution/Baileys URLs, SMTP, etc.) keyed by `user_id`.

## Deployment

Two Render Blueprints (separate git repos):
- **`riseflow-app`** — `GustavoAgrico/riseflow-app` (this repo), root `render.yaml`, Dockerfile builds Vite then runs Express
- **`riseflow-wa`** — `GustavoAgrico/riseflow-wa-server`, `whatsapp-server/render.yaml`, plan: starter (must stay awake), 1 GB persistent disk at `/data`

`VITE_*` vars are Docker build ARGs (baked into the bundle) — changing them requires a new build, not just a restart.
