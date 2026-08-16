import { hasGeminiCredentials, geminiModel } from "../server/llm.js";

interface ResponseLike {
  json(body: unknown): void;
}

export default function handler(_request: unknown, response: ResponseLike): void {
  response.json({
    status: "ok",
    service: "trip-trace-api",
    provider: hasGeminiCredentials() ? `gemini:${geminiModel()}` : "demo",
    timestamp: new Date().toISOString(),
  });
}
