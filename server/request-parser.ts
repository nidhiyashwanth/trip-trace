import { DESTINATION_CATALOG } from "./catalog";
import type { AgentId, ParsedRequest } from "../shared/types";

const REGION_NAMES = ["Europe", "Asia", "Africa", "Americas", "Middle East"];
const INTEREST_NAMES = [
  "food",
  "culture",
  "history",
  "beach",
  "nature",
  "hiking",
  "architecture",
  "markets",
  "nightlife",
  "cycling",
];
const EXCLUSION_COUNTRIES = [
  "Spain",
  "Portugal",
  "Greece",
  "Italy",
  "Croatia",
  "Morocco",
  "Japan",
  "France",
  "Turkey",
  "Malta",
  "Cyprus",
];
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
};

export function parseRequest(prompt: string): ParsedRequest {
  const raw = prompt.trim();
  const lower = raw.toLowerCase();
  const dayMatch = lower.match(/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)[ -]*(?:day|days|night|nights)/);
  const nightMatch = lower.match(/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)[ -]*(?:night|nights)/);
  const durationValue = dayMatch ? parseCount(dayMatch[1]) : null;
  const nightValue = nightMatch ? parseCount(nightMatch[1]) : null;
  const days = dayMatch
    ? Math.max(1, Math.min(21, durationValue! + (nightValue ? 1 : 0)))
    : 5;
  const budgetMatch =
    lower.match(/(?:under|below|within|up to|maximum|max|budget(?: of)?)\s*£?\s*([\d,]+)/) ??
    lower.match(/£\s*([\d,]+)/) ??
    lower.match(/([\d,]+)\s*(?:pounds|gbp)/);
  const budgetProvided = Boolean(budgetMatch);
  const budgetGbp = budgetMatch ? Number(budgetMatch[1].replaceAll(",", "")) : 1500;
  const region = REGION_NAMES.find((name) => lower.includes(name.toLowerCase())) ?? null;
  const climate = ["warm", "sunny", "hot", "cool", "cold", "snow", "mild"]
    .find((name) => lower.includes(name)) ?? null;
  const travelStyle = ["relaxed", "romantic", "family", "adventure", "luxury", "slow"]
    .find((name) => lower.includes(name)) ?? null;
  const interests = INTEREST_NAMES.filter((name) => lower.includes(name));
  const destinationHint = DESTINATION_CATALOG.find((entry) =>
    lower.includes(entry.name.toLowerCase()),
  )?.name ?? null;
  const excludedCountries = EXCLUSION_COUNTRIES.filter((country) =>
    hasExclusion(lower, country.toLowerCase()),
  );
  const hardConstraints = extractConstraints(raw, lower, budgetProvided);
  const assumptions: string[] = [];
  if (!dayMatch) assumptions.push("Assumed a five-day trip because no duration was supplied.");
  if (!budgetProvided) assumptions.push("Assumed a £1,500 trip budget because no budget was supplied.");
  if (!region) assumptions.push("No region was supplied, so the planner compared a small curated catalog.");
  if (interests.length === 0) assumptions.push("No specific interests were supplied; the plan balances food, culture, and rest.");

  return {
    raw,
    days,
    budgetGbp: Math.max(100, Math.min(100_000, budgetGbp)),
    budgetProvided,
    region,
    climate,
    travelStyle,
    interests,
    destinationHint,
    excludedCountries,
    hardConstraints,
    assumptions,
  };
}

export function routeRequest(request: ParsedRequest): AgentId[] {
  const lower = request.raw.toLowerCase();
  const asksForBudget = /budget|cost|price|spend|£|pounds|gbp|cheap|under|within/.test(lower);
  const asksForItinerary = /itinerary|day by day|schedule|activities|plan|see and do/.test(lower);
  const asksForDestination = /destination|where|somewhere|recommend|city|country|beach|warm|sunny/.test(lower);
  const hasTripShape = Boolean(request.days || request.budgetProvided || request.region || request.climate);

  if (asksForItinerary || (asksForBudget && hasTripShape && !asksForDestination)) {
    const route: AgentId[] = [];
    if (!request.destinationHint || asksForDestination) route.push("destination");
    route.push("itinerary");
    if (asksForBudget) route.push("budget");
    return unique(route);
  }
  if (asksForBudget && asksForDestination) return ["destination", "budget"];
  if (asksForBudget) return ["budget"];
  if (asksForDestination || !hasTripShape) return ["destination"];
  return ["destination", "itinerary", "budget"];
}

function unique(values: AgentId[]): AgentId[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function hasExclusion(text: string, country: string): boolean {
  const exclusionPattern = new RegExp(
    `(?:not|no|without|avoid|exclude|excluding|do not recommend|must not recommend)[^.!?]{0,24}\\b${country}\\b`,
  );
  return exclusionPattern.test(text);
}

function extractConstraints(raw: string, lower: string, budgetProvided: boolean): string[] {
  const constraints: string[] = [];
  const sentences = raw.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    if (/(?:must|only|under|below|within|not|avoid|without|exclude|do not)/.test(sentenceLower)) {
      constraints.push(sentence);
    }
  }
  if (budgetProvided && !constraints.some((constraint) => /£|budget|under|below|within/i.test(constraint))) {
    constraints.push("Stay within the stated budget.");
  }
  if (constraints.length === 0 && lower.includes("warm")) constraints.push("Prefer warm weather.");
  return constraints.slice(0, 6);
}

function parseCount(value: string): number {
  return NUMBER_WORDS[value] ?? Number(value);
}
