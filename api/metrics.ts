import { buildObservabilitySnapshot } from "../server/observability.js";
import { JsonAuditRepository } from "../server/persistence.js";

interface RequestLike {
  query?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): void;
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  try {
    process.env.DATA_DIR ??= "/tmp/trip-trace-data";
    const value = request.query?.limit;
    const rawLimit = Array.isArray(value) ? value[0] : value;
    const limit = Number(rawLimit ?? 100);
    const records = await new JsonAuditRepository().list(100);
    response.json(buildObservabilitySnapshot(records, Number.isFinite(limit) ? limit : 100));
  } catch {
    response.status(500).json({ error: "Operational metrics are temporarily unavailable. Try again shortly." });
  }
}
