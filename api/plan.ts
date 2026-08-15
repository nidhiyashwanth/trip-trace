import { randomUUID } from "node:crypto";
import { orchestrate } from "../server/orchestrator";
import { JsonAuditRepository } from "../server/persistence";
import type { AuditRecord, PlanStreamEvent } from "../shared/types";

interface RequestLike {
  method?: string;
  body?: unknown;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  setHeader(name: string, value: string): void;
  flushHeaders?(): void;
  write(chunk: string): void;
  end(): void;
  json(body: unknown): void;
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Only POST is supported for planning." });
    return;
  }
  const body = typeof request.body === "string" ? parseBody(request.body) : request.body;
  const prompt = typeof (body as { prompt?: unknown } | null)?.prompt === "string"
    ? (body as { prompt: string }).prompt.trim()
    : "";
  if (prompt.length < 12 || prompt.length > 2_000) {
    response.status(400).json({ error: "Tell us a little more about the trip (12 to 2,000 characters)." });
    return;
  }

  process.env.DATA_DIR ??= "/tmp/trip-trace-data";
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();
  const requestId = randomUUID();
  const startedAt = Date.now();
  const send = (event: PlanStreamEvent): void => {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const result = await orchestrate(prompt, { requestId, onEvent: send });
    const audit: AuditRecord = {
      id: requestId,
      createdAt: result.createdAt,
      prompt,
      route: result.route,
      mode: result.mode,
      status: "complete",
      destination: result.destinations?.selected.name ?? null,
      totalGbp: result.budget?.totalGbp ?? null,
      durationMs: Date.now() - startedAt,
    };
    await new JsonAuditRepository().append(audit);
  } catch {
    send({ type: "error", message: "The plan could not be completed. Check the request and try again." });
  } finally {
    response.end();
  }
}

function parseBody(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
