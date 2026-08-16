import type {
  AgentMode,
  AuditRecord,
  DestinationOption,
  ObservabilitySnapshot,
  PlanResult,
  PlanStreamEvent,
} from "../shared/types";

const LOCAL_AUDIT_KEY = "trip-trace.audit.v1";

export async function streamPlan(
  prompt: string,
  onEvent: (event: PlanStreamEvent) => void,
  destination?: DestinationOption,
): Promise<PlanResult> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(destination ? { prompt, destination } : { prompt }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? "The planner could not be reached.");
  }
  if (!response.body) throw new Error("The planner returned no stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: PlanResult | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (!data) continue;
        const event = JSON.parse(data) as PlanStreamEvent;
        onEvent(event);
        if (event.type === "result") result = event.result;
        if (event.type === "error") throw new Error(event.message);
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!result) throw new Error("The planner ended without a result.");
  return result;
}

export async function loadAudit(limit = 8): Promise<AuditRecord[]> {
  const localRecords = readLocalAudits();
  try {
    const response = await fetch(`/api/audit?limit=${limit}`);
    if (!response.ok) throw new Error("Audit history is unavailable.");
    const payload = await response.json() as { records?: AuditRecord[] };
    return mergeAuditRecords(payload.records ?? [], localRecords, limit);
  } catch {
    if (localRecords.length > 0) return localRecords.slice(0, limit);
    throw new Error("Audit history is unavailable.");
  }
}

export async function loadMetrics(): Promise<ObservabilitySnapshot> {
  const localRecords = readLocalAudits();
  try {
    const response = await fetch("/api/metrics?limit=100");
    if (!response.ok) throw new Error("Operational metrics are unavailable.");
    const snapshot = await response.json() as ObservabilitySnapshot;
    const knownIds = new Set(snapshot.recent.map((record) => record.id));
    const localOnly = localRecords.filter((record) => !knownIds.has(record.id));
    return localOnly.length > 0 ? mergeMetrics(snapshot, buildLocalMetrics(localOnly)) : snapshot;
  } catch {
    if (localRecords.length > 0) return buildLocalMetrics(localRecords);
    throw new Error("Operational metrics are unavailable.");
  }
}

export function rememberAudit(record: AuditRecord): void {
  if (typeof window === "undefined") return;
  try {
    const records = mergeAuditRecords([record], readLocalAudits(), 100);
    window.localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(records));
  } catch {
    // Browser storage is an optional deployment fallback, not a request boundary.
  }
}

function readLocalAudits(): AuditRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_AUDIT_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed as AuditRecord[] : [];
  } catch {
    return [];
  }
}

function mergeAuditRecords(serverRecords: AuditRecord[], localRecords: AuditRecord[], limit: number): AuditRecord[] {
  const serverIds = new Set(serverRecords.map((record) => record.id));
  return [...serverRecords, ...localRecords.filter((record) => !serverIds.has(record.id))]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, Math.max(1, Math.min(100, limit)));
}

function buildLocalMetrics(records: AuditRecord[]): ObservabilitySnapshot {
  const modeCounts: Record<AgentMode, number> = { demo: 0, gemini: 0, mixed: 0 };
  const routeCounts: Record<string, number> = {};
  for (const record of records) {
    modeCounts[record.mode] += 1;
    const route = record.route.length > 0 ? record.route.join(" → ") : "No agent route";
    routeCounts[route] = (routeCounts[route] ?? 0) + 1;
  }
  return {
    totalRequests: records.length,
    completedRequests: records.filter((record) => record.status === "complete").length,
    errorRequests: records.filter((record) => record.status === "error").length,
    averageDurationMs: records.length > 0 ? Math.round(records.reduce((total, record) => total + record.durationMs, 0) / records.length) : 0,
    modeCounts,
    routeCounts,
    recent: records.slice(0, 25).map(({ id, createdAt, route, mode, status, destination, totalGbp, durationMs }) => ({
      id,
      createdAt,
      route,
      mode,
      status,
      destination,
      totalGbp,
      durationMs,
    })),
  };
}

function mergeMetrics(server: ObservabilitySnapshot, local: ObservabilitySnapshot): ObservabilitySnapshot {
  const modeCounts: Record<AgentMode, number> = {
    demo: server.modeCounts.demo + local.modeCounts.demo,
    gemini: server.modeCounts.gemini + local.modeCounts.gemini,
    mixed: server.modeCounts.mixed + local.modeCounts.mixed,
  };
  const routeCounts: Record<string, number> = { ...server.routeCounts };
  for (const [route, count] of Object.entries(local.routeCounts)) routeCounts[route] = (routeCounts[route] ?? 0) + count;
  const totalRequests = server.totalRequests + local.totalRequests;
  return {
    totalRequests,
    completedRequests: server.completedRequests + local.completedRequests,
    errorRequests: server.errorRequests + local.errorRequests,
    averageDurationMs: totalRequests > 0
      ? Math.round((server.averageDurationMs * server.totalRequests + local.averageDurationMs * local.totalRequests) / totalRequests)
      : 0,
    modeCounts,
    routeCounts,
    recent: [...server.recent, ...local.recent]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 25),
  };
}
