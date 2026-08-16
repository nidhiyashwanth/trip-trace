import { isCountryExcluded } from "./catalog.js";
import type {
  BudgetOutput,
  DestinationOutput,
  DestinationOption,
  ItineraryOutput,
  ParsedRequest,
} from "../shared/types";

export function assertDestinationOption(value: unknown, request: ParsedRequest): asserts value is DestinationOption {
  if (!value || typeof value !== "object") throw new Error("Selected destination is invalid.");
  const option = value as Partial<DestinationOption>;
  if (
    typeof option.name !== "string" ||
    typeof option.country !== "string" ||
    typeof option.region !== "string" ||
    typeof option.climate !== "string" ||
    typeof option.whyItFits !== "string" ||
    !option.name.trim() ||
    !option.country.trim() ||
    !option.region.trim() ||
    !option.climate.trim() ||
    !option.whyItFits.trim()
  ) {
    throw new Error("Selected destination is incomplete.");
  }
  const amounts = [
    option.estimatedTransportGbp,
    option.estimatedStayGbp,
    option.estimatedFoodAndActivitiesGbp,
    option.estimatedTotalGbp,
  ];
  if (amounts.some((amount) => typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
    throw new Error("Selected destination has invalid estimates.");
  }
  const selectedCountry = option.country as string;
  if (request.excludedCountries.some((country) => country.toLowerCase() === selectedCountry.toLowerCase())) {
    throw new Error("Selected destination violates an excluded-country hard constraint.");
  }
}

export function assertDestinationOutput(
  output: DestinationOutput,
  request: ParsedRequest,
): void {
  if (!output || !output.selected || !Array.isArray(output.suggestions) || output.suggestions.length === 0) {
    throw new Error("Destination Agent returned no usable suggestions.");
  }
  assertDestinationOption(output.selected, request);
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
  if (request.destinationHint && output.selected.name.toLowerCase() !== request.destinationHint.toLowerCase()) {
    throw new Error("Destination Agent did not use the destination selected by the user.");
  }
  for (const suggestion of output.suggestions) {
    assertDestinationOption(suggestion, request);
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
