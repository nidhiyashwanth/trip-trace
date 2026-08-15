# Decision note

## 1. A bounded workflow instead of a free-form agent loop

The request is routed to the smallest useful path, with the core travel brief using Destination -> Itinerary -> Budget. This is a deliberate workflow: each specialist has one job, receives the structured output it needs, and can be tested independently. The final synthesis is kept in the orchestration layer so the UI never has to understand agent order. This makes the dependency chain visible in the activity trace and gives us a clean place to retry or replace one provider later.

## 2. Specialist contracts plus application-owned guardrails

Each agent has a separate role, prompt contract, and deterministic implementation. Destination output includes a reason for every suggestion and is filtered against exclusions. Itinerary output includes a day-by-day travel note and uncertainty. Budget output exposes line items, overage, and a cheaper alternative. Optional Gemini calls request JSON, but local validation remains authoritative because syntactically valid model output can still violate a user's hard constraint.

## 3. Free, inspectable operation first

The default provider is a deterministic demo engine so the reviewer can run the submission without paying for a key. `GEMINI_API_KEY` enables the same contracts against the Gemini free tier, with per-agent fallback if a call fails. Requests are persisted behind a repository interface to a bounded JSON audit file for the time-boxed build; the Azure note describes the production database and queue version.

I deliberately cut enterprise authentication, live flight/hotel inventory, external travel APIs, and a large observability dashboard. They would make the demo less reliable without proving the orchestration brief. The next production increment would replace estimates with timestamped provider data, add identity and tenant-scoped audit access, and move long-running work behind a queue.
