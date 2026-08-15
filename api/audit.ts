import { JsonAuditRepository } from "../server/persistence";

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
    const limit = Number(rawLimit ?? 20);
    const records = await new JsonAuditRepository().list(Number.isFinite(limit) ? limit : 20);
    response.json({ records });
  } catch {
    response.status(500).json({ error: "Audit history is temporarily unavailable. Try again shortly." });
  }
}
