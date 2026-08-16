import type { AgentMode, AuditRecord, ObservabilitySnapshot } from "../shared/types";

const MODES: AgentMode[] = ["demo", "gemini", "mixed"];

export function buildObservabilitySnapshot(
  records: AuditRecord[],
  recentLimit = 12,
): ObservabilitySnapshot {
  const modeCounts: Record<AgentMode, number> = { demo: 0, gemini: 0, mixed: 0 };
  const routeCounts: Record<string, number> = {};
  for (const record of records) {
    if (MODES.includes(record.mode)) modeCounts[record.mode] += 1;
    const route = record.route.length > 0 ? record.route.join(" → ") : "No agent route";
    routeCounts[route] = (routeCounts[route] ?? 0) + 1;
  }

  const totalDurationMs = records.reduce((total, record) => total + Math.max(0, record.durationMs), 0);
  return {
    totalRequests: records.length,
    completedRequests: records.filter((record) => record.status === "complete").length,
    errorRequests: records.filter((record) => record.status === "error").length,
    averageDurationMs: records.length > 0 ? Math.round(totalDurationMs / records.length) : 0,
    modeCounts,
    routeCounts,
    recent: records.slice(0, Math.max(1, Math.min(25, recentLimit))).map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      route: record.route,
      mode: record.mode,
      status: record.status,
      destination: record.destination,
      totalGbp: record.totalGbp,
      durationMs: record.durationMs,
    })),
  };
}
