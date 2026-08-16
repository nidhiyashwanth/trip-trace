import "dotenv/config";
import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { orchestrate } from "./orchestrator.js";
import { buildObservabilitySnapshot } from "./observability.js";
import { JsonAuditRepository } from "./persistence.js";
import { hasGeminiCredentials, geminiModel } from "./llm.js";
import { parseRequest } from "./request-parser.js";
import { assertDestinationOption } from "./validation.js";
import type { DestinationOption } from "../shared/types";
import type { AuditRecord, PlanStreamEvent } from "../shared/types";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const auditRepository = new JsonAuditRepository();
const staticDirectory = path.resolve(process.cwd(), "dist");

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "trip-trace-api",
    provider: process.env.AGENT_MODE?.toLowerCase() === "demo" ? "demo" : hasGeminiCredentials() ? `gemini:${geminiModel()}` : "demo",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/audit", async (request, response) => {
  try {
    const rawLimit = Number(request.query.limit ?? 20);
    const records = await auditRepository.list(Number.isFinite(rawLimit) ? rawLimit : 20);
    response.json({ records });
  } catch {
    response.status(500).json({ error: "Audit history is temporarily unavailable. Try again shortly." });
  }
});

app.get("/api/metrics", async (request, response) => {
  try {
    const rawLimit = Number(request.query.limit ?? 100);
    const records = await auditRepository.list(100);
    response.json(buildObservabilitySnapshot(records, Number.isFinite(rawLimit) ? rawLimit : 100));
  } catch {
    response.status(500).json({ error: "Operational metrics are temporarily unavailable. Try again shortly." });
  }
});

app.post("/api/plan", async (request, response) => {
  const prompt = typeof request.body?.prompt === "string" ? request.body.prompt.trim() : "";
  const destination = request.body?.destination as unknown;
  if (prompt.length < 12 || prompt.length > 2_000) {
    response.status(400).json({ error: "Tell us a little more about the trip (12 to 2,000 characters)." });
    return;
  }
  const parsedRequest = parseRequest(prompt);
  let selectedDestination: DestinationOption | undefined;
  if (destination !== undefined) {
    try {
      assertDestinationOption(destination, parsedRequest);
      selectedDestination = destination;
    } catch {
      response.status(400).json({ error: "That destination could not be used for this plan." });
      return;
    }
  }

  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  let clientGone = false;
  request.on("aborted", () => {
    clientGone = true;
  });
  const send = (event: PlanStreamEvent): void => {
    if (!clientGone && !response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const startedAt = Date.now();
  const requestId = randomUUID();

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
    await auditRepository.append(audit);
  } catch {
    await auditRepository.append({
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
    });
    send({ type: "error", message: "The plan could not be completed. Check the request and try again." });
  } finally {
    if (!response.writableEnded) response.end();
  }
});

app.use(express.static(staticDirectory));
app.use((request, response, next) => {
  if (request.method === "GET" && !request.path.startsWith("/api/")) {
    response.sendFile(path.join(staticDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
    return;
  }
  next();
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (response.headersSent) return;
  response.status(500).json({ error: "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`Trip Trace API listening on http://localhost:${port}`);
});

export { app };
