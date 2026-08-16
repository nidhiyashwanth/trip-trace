import { randomUUID } from "node:crypto";
import { orchestrate } from "../server/orchestrator.js";
import { parseRequest } from "../server/request-parser.js";
import { JsonAuditRepository } from "../server/persistence.js";
import { assertDestinationOption } from "../server/validation.js";
import type { AuditRecord, DestinationOption, PlanStreamEvent } from "../shared/types";

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

interface PlanBody {
  prompt?: unknown;
  destination?: unknown;
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Only POST is supported for planning." });
    return;
  }
  const body = typeof request.body === "string" ? parseBody(request.body) : request.body;
  const parsedBody = body && typeof body === "object" ? body as PlanBody : {};
  const prompt = typeof parsedBody.prompt === "string"
    ? parsedBody.prompt.trim()
    : "";
  if (prompt.length < 12 || prompt.length > 2_000) {
    response.status(400).json({ error: "Tell us a little more about the trip (12 to 2,000 characters)." });
    return;
  }
  const parsedRequest = parseRequest(prompt);
  let selectedDestination: DestinationOption | undefined;
  if (parsedBody.destination !== undefined) {
    try {
      assertDestinationOption(parsedBody.destination, parsedRequest);
      selectedDestination = parsedBody.destination;
    } catch {
      response.status(400).json({ error: "That destination could not be used for this plan." });
      return;
    }
  }

  process.env.DATA_DIR ??= "/tmp/trip-trace-data";
  const repository = new JsonAuditRepository();
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
    const result = await orchestrate(prompt, { requestId, onEvent: send, destinationOption: selectedDestination });
    const audit: AuditRecord = {
      id: requestId,
      createdAt: result.createdAt,
      prompt: selectedDestination ? `${prompt}\nSelected destination: ${selectedDestination.name}` : prompt,
      route: result.route,
      mode: result.mode,
      status: "complete",
      destination: result.destinations?.selected.name ?? null,
      totalGbp: result.budget?.totalGbp ?? null,
      durationMs: Date.now() - startedAt,
    };
    await repository.append(audit);
  } catch {
    await repository.append({
      id: requestId,
      createdAt: new Date().toISOString(),
      prompt,
      route: [],
      mode: "demo",
      status: "error",
      destination: null,
      totalGbp: null,
      durationMs: Date.now() - startedAt,
      error: "Plan request failed.",
    }).catch(() => undefined);
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
