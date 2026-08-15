import { isCountryExcluded, DESTINATION_CATALOG } from "./catalog";
import type {
  BudgetOutput,
  DestinationOutput,
  ItineraryOutput,
  ParsedRequest,
} from "../shared/types";

export function assertDestinationOutput(
  output: DestinationOutput,
  request: ParsedRequest,
): void {
  if (!output || !output.selected || !Array.isArray(output.suggestions) || output.suggestions.length === 0) {
    throw new Error("Destination Agent returned no usable suggestions.");
  }
  if (isCountryExcluded({
    name: output.selected.name,
    country: output.selected.country,
    region: output.selected.region,
    climate: output.selected.climate,
    tags: [],
    transportGbp: output.selected.estimatedTransportGbp,
    stayPerDayGbp: 0,
    foodAndActivitiesPerDayGbp: 0,
  }, request)) {
    throw new Error("Destination Agent selected a country excluded by the user.");
  }
  for (const suggestion of output.suggestions) {
    if (!suggestion.name || !suggestion.country || !suggestion.whyItFits) {
      throw new Error("Every destination suggestion must include a reason.");
    }
    if (request.excludedCountries.some((country) => country.toLowerCase() === suggestion.country.toLowerCase())) {
      throw new Error("Destination Agent included a country excluded by the user.");
    }
  }
}

export function assertItineraryOutput(output: ItineraryOutput, request: ParsedRequest): void {
  if (!output || !output.destination || !Array.isArray(output.days) || output.days.length !== request.days) {
    throw new Error(`Itinerary Agent must return exactly ${request.days} days.`);
  }
  output.days.forEach((day, index) => {
    if (day.day !== index + 1 || !day.title || !day.plan || !day.travelNote || !day.confidence) {
      throw new Error(`Itinerary Agent day ${index + 1} is incomplete.`);
    }
  });
  if (!output.uncertaintyNote) throw new Error("Itinerary Agent must state uncertainty.");
}

export function assertBudgetOutput(output: BudgetOutput, request: ParsedRequest): void {
  if (!output || output.currency !== "GBP" || output.budgetGbp !== request.budgetGbp) {
    throw new Error("Budget Agent returned an invalid budget contract.");
  }
  const recomputed =
    output.transportGbp +
    output.accommodationGbp +
    output.foodAndActivitiesGbp +
    output.contingencyGbp;
  if (Math.abs(recomputed - output.totalGbp) > 1) {
    throw new Error("Budget Agent total does not match its line items.");
  }
  const expectedStatus = output.totalGbp <= output.budgetGbp ? "within_budget" : "over_budget";
  if (output.status !== expectedStatus) throw new Error("Budget Agent status contradicts its total.");
  if (output.status === "over_budget" && (!output.alternative || output.overageGbp <= 0)) {
    throw new Error("Budget Agent must explain an overage and propose an alternative.");
  }
}

export function assertKnownDestination(name: string): void {
  if (!DESTINATION_CATALOG.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Destination ${name} is outside the current curated catalog.`);
  }
}
