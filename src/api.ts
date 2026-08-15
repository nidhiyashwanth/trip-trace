import type { AuditRecord, PlanResult, PlanStreamEvent } from "../shared/types";

export async function streamPlan(
  prompt: string,
  onEvent: (event: PlanStreamEvent) => void,
): Promise<PlanResult> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ prompt }),
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

export async function loadAudit(): Promise<AuditRecord[]> {
  const response = await fetch("/api/audit?limit=8");
  if (!response.ok) throw new Error("Audit history is unavailable.");
  const payload = await response.json() as { records?: AuditRecord[] };
  return payload.records ?? [];
}
