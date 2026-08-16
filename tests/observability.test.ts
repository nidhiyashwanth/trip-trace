import { describe, expect, it } from "vitest";
import { buildObservabilitySnapshot } from "../server/observability";
import type { AuditRecord } from "../shared/types";

describe("observability snapshot", () => {
  it("summarises safe operational fields without exposing prompts or errors", () => {
    const records: AuditRecord[] = [
      {
        id: "one",
        createdAt: "2026-08-17T00:00:00.000Z",
        prompt: "private prompt",
        route: ["destination", "itinerary", "budget"],
        mode: "demo",
        status: "complete",
        destination: "Lisbon",
        totalGbp: 924,
        durationMs: 1200,
      },
      {
        id: "two",
        createdAt: "2026-08-17T00:01:00.000Z",
        prompt: "private prompt",
        route: [],
        mode: "mixed",
        status: "error",
        destination: null,
        totalGbp: null,
        durationMs: 800,
        error: "provider details must stay private",
      },
    ];

    const snapshot = buildObservabilitySnapshot(records, 1);
    expect(snapshot.totalRequests).toBe(2);
    expect(snapshot.completedRequests).toBe(1);
    expect(snapshot.errorRequests).toBe(1);
    expect(snapshot.averageDurationMs).toBe(1_000);
    expect(snapshot.modeCounts).toEqual({ demo: 1, gemini: 0, mixed: 1 });
    expect(snapshot.routeCounts).toEqual({ "destination → itinerary → budget": 1, "No agent route": 1 });
    expect(snapshot.recent).toHaveLength(1);
    expect(snapshot.recent[0]).not.toHaveProperty("prompt");
    expect(snapshot.recent[0]).not.toHaveProperty("error");
  });
});
