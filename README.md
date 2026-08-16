# Trip Trace

Trip Trace is a small multi-agent trip planner built for the Senior Full Stack Engineer take-home. A user writes a plain-language brief such as “five days somewhere warm in Europe for under £1,500”. The API parses the brief, routes it through specialist agents, validates each result, synthesises a plan, and writes an audit record.

## Submission status

- Live URL: [https://zotefoam.vercel.app](https://zotefoam.vercel.app) (Vercel production deployment, verified 2026-08-17).
- Repository: [github.com/nidhiyashwanth/trip-trace](https://github.com/nidhiyashwanth/trip-trace/tree/agent/trip-trace-take-home), branch `agent/trip-trace-take-home`.
- Default mode: deterministic demo, no API key and no paid service required.
- Optional model mode: set `GEMINI_API_KEY` in an untracked `.env` file. The default model is `gemini-2.5-flash-lite`; set `GEMINI_MODEL` to change it.

## Stack

- React 18 + TypeScript + Vite 8 frontend.
- Node.js + Express orchestration API.
- Three separate agent contracts: Destination, Itinerary, and Budget.
- JSON file audit repository behind a small persistence interface.
- Optional Gemini JSON generation with application-level semantic guardrails.

## Run locally

Requirements: Node 20.19+ and pnpm 11+.

```powershell
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:8787`.

For a model-backed run, copy `.env.example` to `.env` and add a free Google AI Studio key. Do not commit `.env`.

## Deploy to a free Vercel project

The checked-in Vercel adapters reuse the same orchestration contract and keep demo mode keyless:

```powershell
pnpm dlx vercel --prod --yes
```

Set `AGENT_MODE=demo` for a no-key deployment, or add `GEMINI_API_KEY` and `GEMINI_MODEL` as encrypted project environment variables for model-backed runs. Verify the deployed `/api/health`, `/api/metrics`, and a streamed `POST /api/plan`, then submit a brief at the returned URL. Append `?role=operator` to open the read-only operator stub.

## Checks

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

## Walkthrough

1. Submit: `Plan five days somewhere warm in Europe under £1,500 with food, culture, and a relaxed pace. Do not recommend Spain.`
2. Confirm the plan status shows Destination -> Itinerary -> Budget and shows each contribution.
3. Confirm the result includes three clickable destination options. Choose another option and verify the itinerary and budget rebuild for that destination.
4. Confirm the result includes destination reasons, five itinerary days with travel notes, a line-item budget, and a within-budget/over-budget decision.
5. Submit a second brief, then request `GET http://localhost:8787/api/audit` and confirm both requests are present with route, mode, status, destination, total, and duration.
6. Switch to `?role=operator` and confirm the separate read-only metrics/log view shows request counts, durations, run modes, route mix, and recent outcomes without prompts or provider payloads.
7. Submit an empty form and confirm the UI rejects it without an API call.

## API

- `GET /api/health` - runtime and provider mode.
- `POST /api/plan` - accepts `{ "prompt": string, "destination": DestinationOption? }` and returns an SSE stream of request, agent, result, or error events. The selected option is validated and reused for the rebuilt itinerary and budget, even when it is outside the deterministic demo catalog.
- `GET /api/audit?limit=20` - returns recent persisted audit records.
- `GET /api/metrics?limit=100` - returns redacted counts, durations, route/mode mix, and recent operational records for the operator stub.

## Design and production notes

See `DECISION_NOTE.md` for the three key decisions and deliberate cuts. See `ARCHITECTURE_NOTE.md` for the Azure design for 500+ concurrent users. `AGENTS.md`, `PROGRESS.md`, and `feature-list.json` are the repository harness: they keep scope, checks, and handoff state visible.

## Current limitations

The demo estimates are illustrative, not live availability or prices. The JSON repository is intentionally small and suitable for the take-home. On Vercel's free serverless runtime, the browser keeps a session-scoped redacted audit fallback because function-local files are ephemeral; production would use tenant-scoped PostgreSQL, a queue for long model runs, Entra ID, Key Vault, and OpenTelemetry as described in the architecture note.
