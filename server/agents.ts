import { DESTINATION_CATALOG, isCountryExcluded, toDestinationOption, type CatalogEntry } from "./catalog.js";
import type {
  BudgetOutput,
  DestinationOption,
  DestinationOutput,
  ItineraryDay,
  ItineraryOutput,
  ParsedRequest,
} from "../shared/types";

export function runDestinationDemo(request: ParsedRequest): DestinationOutput {
  const eligible = DESTINATION_CATALOG.filter((entry) => !isCountryExcluded(entry, request));
  if (eligible.length === 0) {
    throw new Error("No destination in the curated catalog satisfies the stated exclusions.");
  }
  const scored = eligible
    .map((entry) => ({ entry, score: scoreDestination(entry, request) }))
    .sort((left, right) => right.score - left.score);
  const hinted = request.destinationHint
    ? scored.find(({ entry }) => entry.name.toLowerCase() === request.destinationHint?.toLowerCase())
    : null;
  const candidates = hinted
    ? [hinted, ...scored.filter(({ entry }) => entry.name !== hinted.entry.name)]
    : scored;
  const suggestions = candidates
    .slice(0, 3)
    .map(({ entry }) => toDestinationOption(entry, request));
  const selected = pickSelected(suggestions, request);
  return {
    suggestions,
    selected,
    guardrailNote: request.excludedCountries.length > 0
      ? `${request.excludedCountries.join(", ")} stays out of the shortlist.`
      : "Every option was checked against the shape of your brief.",
  };
}

function scoreDestination(entry: CatalogEntry, request: ParsedRequest): number {
  let score = 0;
  if (request.destinationHint?.toLowerCase() === entry.name.toLowerCase()) score += 100;
  if (request.region && request.region.toLowerCase() === entry.region.toLowerCase()) score += 24;
  if (request.climate && entry.climate.toLowerCase().includes(request.climate.toLowerCase())) score += 18;
  score += request.interests.filter((interest) => entry.tags.includes(interest)).length * 8;
  if (request.travelStyle && entry.tags.includes(request.travelStyle)) score += 8;
  const estimate = entry.transportGbp + (entry.stayPerDayGbp + entry.foodAndActivitiesPerDayGbp) * request.days;
  if (estimate <= request.budgetGbp) score += 14;
  else score -= Math.min(20, Math.ceil((estimate - request.budgetGbp) / 100));
  return score;
}

function pickSelected(suggestions: DestinationOption[], request: ParsedRequest): DestinationOption {
  const hinted = suggestions.find(
    (suggestion) => suggestion.name.toLowerCase() === request.destinationHint?.toLowerCase(),
  );
  return hinted ?? suggestions[0];
}

export function runItineraryDemo(
  request: ParsedRequest,
  destination: DestinationOption,
): ItineraryOutput {
  const dayTemplates = buildDayTemplates(destination, request);
  const days: ItineraryDay[] = Array.from({ length: request.days }, (_, index) => {
    const template = dayTemplates[index % dayTemplates.length];
    return {
      day: index + 1,
      title: template.title,
      plan: template.plan,
      travelNote: template.travelNote,
      confidence: index === 0 || index === request.days - 1 ? "medium" : "high",
    };
  });
  return {
    destination: destination.name,
    days,
    uncertaintyNote: "Times are planning estimates. Re-check transport schedules and opening hours before booking.",
  };
}

function buildDayTemplates(
  destination: DestinationOption,
  request: ParsedRequest,
): Array<Omit<ItineraryDay, "day" | "confidence">> {
  const interestLabel = request.interests.length > 0 ? request.interests[0] : "local food";
  return [
    {
      title: "Arrive and settle into one neighbourhood",
      plan: `Keep the first afternoon close to your base in ${destination.name}: check in, take a short orientation walk, and choose an easy ${interestLabel} spot nearby.`,
      travelNote: "One local transfer is realistic after arrival; avoid crossing the whole city on day one.",
    },
    {
      title: "Historic centre at a human pace",
      plan: `Spend the morning on ${destination.name}'s central sights, then leave a long lunch and an unbooked hour before a smaller cultural stop.`,
      travelNote: "Group nearby sights into one walkable area rather than scheduling back-to-back cross-city trips.",
    },
    {
      title: "Food, markets, and a slower afternoon",
      plan: `Use the morning for a market or food-led experience, with the afternoon reserved for a café, viewpoint, or neighbourhood chosen on the day.`,
      travelNote: "A flexible afternoon protects the plan from queues and keeps the day to two main anchors.",
    },
    {
      title: "A single wider excursion",
      plan: `Choose one half-day coastal, nature, or museum excursion that matches the brief, then return to ${destination.name} for dinner.`,
      travelNote: "Treat the excursion as the day's only major transfer; confirm the return connection before leaving.",
    },
    {
      title: "Favourite revisit and departure buffer",
      plan: `Keep the final day local: revisit the place you liked most, buy anything you need, and leave a generous buffer for the journey home.`,
      travelNote: "Do not put a timed attraction far from the departure route on the final day.",
    },
  ];
}

export function runBudgetDemo(
  request: ParsedRequest,
  destination: DestinationOption,
): BudgetOutput {
  const transportGbp = destination.estimatedTransportGbp;
  const accommodationGbp = destination.estimatedStayGbp;
  const foodAndActivitiesGbp = destination.estimatedFoodAndActivitiesGbp;
  const subtotal = transportGbp + accommodationGbp + foodAndActivitiesGbp;
  const contingencyGbp = Math.round(subtotal * 0.1);
  const totalGbp = subtotal + contingencyGbp;
  const status = totalGbp <= request.budgetGbp ? "within_budget" : "over_budget";
  const overageGbp = Math.max(0, totalGbp - request.budgetGbp);
  return {
    currency: "GBP",
    budgetGbp: request.budgetGbp,
    transportGbp,
    accommodationGbp,
    foodAndActivitiesGbp,
    contingencyGbp,
    totalGbp,
    status,
    overageGbp,
    alternative: status === "over_budget"
      ? `Consider ${cheaperAlternative(destination.name)} or reduce the trip by one day before booking.`
      : "Keep the contingency as a buffer for price changes rather than silently spending it.",
  };
}

function cheaperAlternative(current: string): string {
  const currentEntry = DESTINATION_CATALOG.find((entry) => entry.name === current);
  const cheaper = DESTINATION_CATALOG
    .filter((entry) => entry.name !== current)
    .sort((left, right) => left.transportGbp + left.stayPerDayGbp - (right.transportGbp + right.stayPerDayGbp))[0];
  return cheaper && currentEntry ? cheaper.name : "a lower-cost destination";
}

export function synthesize(
  request: ParsedRequest,
  destination: DestinationOutput | null,
  itinerary: ItineraryOutput | null,
  budget: BudgetOutput | null,
): string {
  const selected = destination?.selected.name ?? "a destination from the brief";
  const fitReason = destination?.selected.whyItFits.replace(/\.$/, "").replace(/^./, (character) => character.toLowerCase());
  const opening = destination
    ? `${selected} is the strongest fit because ${fitReason}`
    : `The plan follows the requested brief for ${selected}`;
  const trip = itinerary
    ? ` The ${itinerary.days.length}-day route keeps each day to one main travel area and leaves deliberate recovery time.`
    : "";
  const money = budget
    ? budget.status === "within_budget"
      ? ` The estimate is £${budget.totalGbp}, inside the £${budget.budgetGbp} ceiling with a £${budget.contingencyGbp} contingency line.`
      : ` The estimate is £${budget.totalGbp}, which is £${budget.overageGbp} over the £${budget.budgetGbp} ceiling; ${budget.alternative}`
    : "";
  return `${opening}.${trip}${money}`;
}
