# Decisions

## D001 - Use a predictable sequential workflow

Date: 2026-08-15

Decision: Route a request to the smallest useful path, with the full trip brief using Destination -> Itinerary -> Budget -> deterministic synthesis.

Why: The assignment gives a clear dependency chain, so a fixed workflow is easier to inspect, test, retry, and defend than an autonomous loop. It follows the current guidance to prefer simple composable workflows and add agent autonomy only when the task requires it.

Rejected: A single general-purpose prompt and an open-ended orchestrator. They hide specialist boundaries and make hard-constraint and budget failures harder to test.

## D002 - Keep a deterministic provider beside optional Gemini

Date: 2026-08-15

Decision: Demo mode is the default and is complete without credentials. If `GEMINI_API_KEY` is present, the same agent contracts can call Gemini with JSON output requested; every result still passes local validation and falls back per agent on failure.

Why: The brief requires zero spend. A reviewer should be able to run the app, while the provider boundary demonstrates how a free model can be added without coupling the UI to it.

Rejected: Making the app depend on a secret or silently fabricating a “live” model call.

## D003 - Use JSON audit persistence for the time-boxed submission

Date: 2026-08-15

Decision: Store a bounded audit log in `DATA_DIR/audit.json`, behind a repository interface.

Why: It is transparent, zero-setup, and sufficient to demonstrate persistence locally and on a simple free host. The production note moves this interface to Azure Database for PostgreSQL and a queue.

Rejected: Browser-only localStorage, because it does not prove server-side auditability; enterprise identity and a production database, because the brief explicitly says to keep the take-home focused.

## D004 - Guard model output in code

Date: 2026-08-15

Decision: Parse constraints before agent calls, validate structured output after each call, enforce exclusion and budget rules in application code, and display uncertainty.

Why: Structured output helps shape data but does not guarantee semantic correctness. The application must own hard constraints and the audit trail.

## D005 - Keep the UI focused on the assessment

Date: 2026-08-15

Decision: Keep one restrained black-and-white planner workspace with the brief, agent activity, result, audit history, and interactive destination choices as the only primary surfaces.

Why: The brief values three well-orchestrated agents, transparency, loading/error states, and an audit trail over visual breadth. A direct layout makes those requirements easy to inspect and avoids shipping animation or content that does not help someone plan a trip.

Rejected: A decorative hero, extra editorial sections, live/provider badges, and raw fallback messages. They add surface area without improving the assessed workflow.
