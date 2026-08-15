import { describe, expect, it } from "vitest";
import { runBudgetDemo, runDestinationDemo, runItineraryDemo } from "../server/agents";
import { parseRequest } from "../server/request-parser";
import { assertBudgetOutput, assertDestinationOutput, assertItineraryOutput } from "../server/validation";

describe("agent output guards", () => {
  const request = parseRequest("Plan five days somewhere warm in Europe under £1,500. Do not recommend Spain.");

  it("accepts the deterministic contracts", () => {
    const destination = runDestinationDemo(request);
    const itinerary = runItineraryDemo(request, destination.selected);
    const budget = runBudgetDemo(request, destination.selected);
    expect(() => assertDestinationOutput(destination, request)).not.toThrow();
    expect(() => assertItineraryOutput(itinerary, request)).not.toThrow();
    expect(() => assertBudgetOutput(budget, request)).not.toThrow();
  });

  it("rejects a destination that violates a hard exclusion", () => {
    const safe = runDestinationDemo(request);
    const unsafe = {
      ...safe,
      selected: { ...safe.selected, country: "Spain" },
    };
    expect(() => assertDestinationOutput(unsafe, request)).toThrow(/excluded/);
  });

  it("rejects budget totals that do not reconcile", () => {
    const destination = runDestinationDemo(request);
    const budget = runBudgetDemo(request, destination.selected);
    expect(() => assertBudgetOutput({ ...budget, totalGbp: budget.totalGbp + 100 }, request)).toThrow(/line items/);
  });
});
