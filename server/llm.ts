import type {
  BudgetOutput,
  DestinationOutput,
  ItineraryOutput,
  ParsedRequest,
} from "../shared/types";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function hasGeminiCredentials(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
}

export async function runGeminiDestination(request: ParsedRequest): Promise<DestinationOutput> {
  return callGemini<DestinationOutput>(
    "Destination Agent",
    `You recommend travel destinations. Return only JSON matching the schema. Never recommend a country in excludedCountries. Every suggestion needs a concrete whyItFits tied to region, climate, interests, or budget. Do not invent live availability.\n\nRequest constraints:\n${JSON.stringify(request)}`,
    destinationSchema,
  );
}

export async function runGeminiItinerary(
  request: ParsedRequest,
  destination: DestinationOutput,
): Promise<ItineraryOutput> {
  return callGemini<ItineraryOutput>(
    "Itinerary Agent",
    `You build realistic day-by-day travel plans. Return exactly ${request.days} days as JSON. Keep each day to one main geographic area, describe sequencing and travel time, and state uncertainty. Use the selected destination and destination context; do not add unverified bookings.\n\nRequest:\n${JSON.stringify(request)}\n\nDestination context:\n${JSON.stringify(destination)}`,
    itinerarySchema,
  );
}

export async function runGeminiBudget(
  request: ParsedRequest,
  destination: DestinationOutput,
  itinerary: ItineraryOutput | null,
): Promise<BudgetOutput> {
  return callGemini<BudgetOutput>(
    "Budget Agent",
    `You estimate a trip budget in GBP. Return JSON matching the schema. Recompute total from the line items. Never silently exceed budget: set status to over_budget and propose a cheaper alternative when needed. These are transparent estimates, not live prices.\n\nRequest:\n${JSON.stringify(request)}\n\nDestination:\n${JSON.stringify(destination.selected)}\n\nItinerary:\n${JSON.stringify(itinerary)}`,
    budgetSchema,
  );
}

async function callGemini<T>(agent: string, prompt: string, responseSchema: unknown): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error(`${agent} is not configured with a Gemini key.`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(geminiModel())}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2_400,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${agent} upstream request failed (${response.status}).`);
    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) throw new Error(`${agent} returned an empty response.`);
    return JSON.parse(stripCodeFence(text)) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`${agent} timed out after 25 seconds.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

const destinationSchema = {
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          country: { type: "STRING" },
          region: { type: "STRING" },
          climate: { type: "STRING" },
          whyItFits: { type: "STRING" },
          estimatedTransportGbp: { type: "NUMBER" },
          estimatedStayGbp: { type: "NUMBER" },
          estimatedFoodAndActivitiesGbp: { type: "NUMBER" },
          estimatedTotalGbp: { type: "NUMBER" },
        },
        required: ["name", "country", "region", "climate", "whyItFits", "estimatedTransportGbp", "estimatedStayGbp", "estimatedFoodAndActivitiesGbp", "estimatedTotalGbp"],
      },
    },
    selected: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        country: { type: "STRING" },
        region: { type: "STRING" },
        climate: { type: "STRING" },
        whyItFits: { type: "STRING" },
        estimatedTransportGbp: { type: "NUMBER" },
        estimatedStayGbp: { type: "NUMBER" },
        estimatedFoodAndActivitiesGbp: { type: "NUMBER" },
        estimatedTotalGbp: { type: "NUMBER" },
      },
      required: ["name", "country", "region", "climate", "whyItFits", "estimatedTransportGbp", "estimatedStayGbp", "estimatedFoodAndActivitiesGbp", "estimatedTotalGbp"],
    },
    guardrailNote: { type: "STRING" },
  },
  required: ["suggestions", "selected", "guardrailNote"],
};

const itinerarySchema = {
  type: "OBJECT",
  properties: {
    destination: { type: "STRING" },
    days: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          day: { type: "INTEGER" },
          title: { type: "STRING" },
          plan: { type: "STRING" },
          travelNote: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium"] },
        },
        required: ["day", "title", "plan", "travelNote", "confidence"],
      },
    },
    uncertaintyNote: { type: "STRING" },
  },
  required: ["destination", "days", "uncertaintyNote"],
};

const budgetSchema = {
  type: "OBJECT",
  properties: {
    currency: { type: "STRING", enum: ["GBP"] },
    budgetGbp: { type: "NUMBER" },
    transportGbp: { type: "NUMBER" },
    accommodationGbp: { type: "NUMBER" },
    foodAndActivitiesGbp: { type: "NUMBER" },
    contingencyGbp: { type: "NUMBER" },
    totalGbp: { type: "NUMBER" },
    status: { type: "STRING", enum: ["within_budget", "over_budget"] },
    overageGbp: { type: "NUMBER" },
    alternative: { type: "STRING" },
  },
  required: ["currency", "budgetGbp", "transportGbp", "accommodationGbp", "foodAndActivitiesGbp", "contingencyGbp", "totalGbp", "status", "overageGbp", "alternative"],
};
