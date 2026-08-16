import { describe, expect, it } from "vitest";
import { orchestrate } from "../server/orchestrator";
import { parseRequest, routeRequest } from "../server/request-parser";

describe("Trip Trace contracts", () => {
  it("extracts the constraints that drive routing", () => {
    const request = parseRequest("Plan five days somewhere warm in Europe for under £1,500 with food and culture. Do not recommend Spain.");
    expect(request.days).toBe(5);
    expect(request.budgetGbp).toBe(1500);
    expect(request.region).toBe("Europe");
    expect(request.climate).toBe("warm");
    expect(request.interests).toEqual(["food", "culture"]);
    expect(request.excludedCountries).toEqual(["Spain"]);
    expect(routeRequest(request)).toEqual(["destination", "itinerary", "budget"]);
  });

  it("understands word-number durations and a destination-plus-budget route", () => {
    const request = parseRequest("Suggest somewhere warm under £1,200 with food for five days.");
    expect(request.days).toBe(5);
    expect(request.assumptions).not.toContain("Assumed a five-day trip because no duration was supplied.");
    expect(routeRequest(request)).toEqual(["destination", "budget"]);
  });

  it("runs the full demo chain and preserves the hard exclusion", async () => {
    const previousMode = process.env.AGENT_MODE;
    const previousDelay = process.env.DEMO_DELAY_MS;
    process.env.AGENT_MODE = "demo";
    process.env.DEMO_DELAY_MS = "0";
    try {
      const events: string[] = [];
      const result = await orchestrate(
        "Plan five days somewhere warm in Europe for under £1,500 with food and culture. Do not recommend Spain.",
        { onEvent: (event) => events.push(event.type) },
      );
      expect(result.mode).toBe("demo");
      expect(result.route).toEqual(["destination", "itinerary", "budget"]);
      expect(result.destinations?.selected.country).not.toBe("Spain");
      expect(result.destinations?.suggestions.every((item) => item.country !== "Spain")).toBe(true);
      expect(result.itinerary?.days).toHaveLength(5);
      expect(result.budget?.status).toBe("within_budget");
      expect(result.contributions.map((item) => item.agent)).toEqual(["destination", "itinerary", "budget"]);
      expect(events).toContain("result");
    } finally {
      restoreEnvironment("AGENT_MODE", previousMode);
      restoreEnvironment("DEMO_DELAY_MS", previousDelay);
    }
  });

  it("makes an over-budget decision explicit", async () => {
    const previousMode = process.env.AGENT_MODE;
    const previousDelay = process.env.DEMO_DELAY_MS;
    process.env.AGENT_MODE = "demo";
    process.env.DEMO_DELAY_MS = "0";
    try {
      const result = await orchestrate("Plan 12 days in Kyoto for under £500 with culture and food.");
      expect(result.budget?.status).toBe("over_budget");
      expect(result.budget?.overageGbp).toBeGreaterThan(0);
      expect(result.budget?.alternative).toContain("or reduce the trip");
    } finally {
      restoreEnvironment("AGENT_MODE", previousMode);
      restoreEnvironment("DEMO_DELAY_MS", previousDelay);
    }
  });

  it("can route a known destination itinerary without exposing an unneeded destination step", async () => {
    const previousMode = process.env.AGENT_MODE;
    const previousDelay = process.env.DEMO_DELAY_MS;
    process.env.AGENT_MODE = "demo";
    process.env.DEMO_DELAY_MS = "0";
    try {
      const result = await orchestrate("Build a four-night relaxed itinerary for Lisbon with architecture.");
      expect(result.route).toEqual(["itinerary"]);
      expect(result.itinerary?.destination).toBe("Lisbon");
      expect(result.itinerary?.days).toHaveLength(5);
      expect(result.destinations).toBeNull();
    } finally {
      restoreEnvironment("AGENT_MODE", previousMode);
      restoreEnvironment("DEMO_DELAY_MS", previousDelay);
    }
  });

  it("rebuilds the full plan around a user-selected destination", async () => {
    const previousMode = process.env.AGENT_MODE;
    const previousDelay = process.env.DEMO_DELAY_MS;
    process.env.AGENT_MODE = "demo";
    process.env.DEMO_DELAY_MS = "0";
    try {
      const result = await orchestrate(
        "Plan five days somewhere warm in Europe for under £1,500 with food and culture. Do not recommend Spain.",
        {
          destinationOption: {
            name: "Varanasi",
            country: "India",
            region: "Asia",
            climate: "warm and dry",
            whyItFits: "A meaningful cultural destination with food and a reflective pace.",
            estimatedTransportGbp: 560,
            estimatedStayGbp: 300,
            estimatedFoodAndActivitiesGbp: 190,
            estimatedTotalGbp: 1050,
          },
        },
      );
      expect(result.destinations?.selected.name).toBe("Varanasi");
      expect(result.itinerary?.destination).toBe("Varanasi");
      expect(result.budget?.status).toBe("within_budget");
    } finally {
      restoreEnvironment("AGENT_MODE", previousMode);
      restoreEnvironment("DEMO_DELAY_MS", previousDelay);
    }
  });

  it("keeps provider failure details out of user-facing fallback warnings", async () => {
    const previousMode = process.env.AGENT_MODE;
    const previousKey = process.env.GEMINI_API_KEY;
    const previousFetch = globalThis.fetch;
    process.env.AGENT_MODE = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    globalThis.fetch = async () => new Response("upstream failure", { status: 503 });
    try {
      const result = await orchestrate("Plan five days somewhere warm in Europe under £1,500.");
      expect(result.mode).toBe("demo");
      expect(result.warnings.join(" ")).not.toContain("503");
      expect(result.warnings).toContain("Some details were estimated locally because live travel data was unavailable.");
    } finally {
      restoreEnvironment("AGENT_MODE", previousMode);
      restoreEnvironment("GEMINI_API_KEY", previousKey);
      globalThis.fetch = previousFetch;
    }
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
