# Trip Trace

Trip Trace is the take-home submission for a Senior Full Stack Engineer role. It is a Vite + React 18 + TypeScript frontend backed by a small Node/Express orchestration API. The API routes a natural-language trip brief through destination, itinerary, and budget agents, then records an audit entry.

## First run

```powershell
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The app runs without credentials in deterministic demo mode. Copy `.env.example` to `.env` only when testing the optional Gemini provider.

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

The full-pipeline manual check is documented in `README.md` under “Walkthrough”.

## Hard constraints

1. Keep the app runnable without a paid service or API key.
2. Never commit `.env`, API keys, generated audit data, or provider responses containing secrets.
3. Keep the three agents separate by role and prompt contract.
4. Route and chain agents in the orchestration layer; do not put workflow decisions in React components.
5. Validate model-shaped data before using it in a response or persistence record.
6. A hard destination constraint must never be silently ignored; fall back to a safe deterministic result when needed.
7. A budget overage must be visible and paired with a cheaper alternative.
8. Itinerary output must include a travel/sequence note and uncertainty when planning facts are approximate.
9. Persist one audit record per request with prompt, route, mode, status, destination, total, and duration.
10. Keep user-facing errors actionable and do not expose provider keys or raw upstream payloads.
11. Preserve the React 18 + TypeScript + Vite requirement from the brief.
12. One feature may be active at a time (WIP = 1); verify it before starting the next feature.
13. Do not expand into authentication, real-time travel inventory, or broad visual polish within this take-home.

## Routing map

- `DECISIONS.md`: durable architecture and scope decisions.
- `PROGRESS.md`: current state, checks, blockers, and next action.
- `feature-list.json`: executable feature state; `passing` requires verification evidence.
- `DECISION_NOTE.md`: the <=400-word interview submission note.
- `ARCHITECTURE_NOTE.md`: the <=300-word Azure production note.
- `server/`: orchestration, agents, provider boundary, and audit persistence.
- `src/`: frontend workspace and stream consumer.
- `shared/`: API/domain contracts used by both sides.

## Definition of Done

Feature work is complete only after the applicable static checks, runtime API check, and browser walkthrough pass. The evaluator owns the pass decision: update `feature-list.json` only with command evidence, and leave `PROGRESS.md` current before handoff.
