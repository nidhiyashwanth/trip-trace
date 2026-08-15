import type { DestinationOption, ParsedRequest } from "../shared/types";

export interface CatalogEntry {
  name: string;
  country: string;
  region: string;
  climate: string;
  tags: string[];
  transportGbp: number;
  stayPerDayGbp: number;
  foodAndActivitiesPerDayGbp: number;
}

export const DESTINATION_CATALOG: CatalogEntry[] = [
  {
    name: "Lisbon",
    country: "Portugal",
    region: "Europe",
    climate: "warm and breezy",
    tags: ["food", "culture", "architecture", "coast", "relaxed"],
    transportGbp: 240,
    stayPerDayGbp: 72,
    foodAndActivitiesPerDayGbp: 48,
  },
  {
    name: "Valencia",
    country: "Spain",
    region: "Europe",
    climate: "warm and sunny",
    tags: ["food", "beach", "architecture", "relaxed", "cycling"],
    transportGbp: 250,
    stayPerDayGbp: 68,
    foodAndActivitiesPerDayGbp: 45,
  },
  {
    name: "Athens",
    country: "Greece",
    region: "Europe",
    climate: "warm and dry",
    tags: ["culture", "history", "food", "architecture", "islands"],
    transportGbp: 280,
    stayPerDayGbp: 62,
    foodAndActivitiesPerDayGbp: 44,
  },
  {
    name: "Palermo",
    country: "Italy",
    region: "Europe",
    climate: "warm and Mediterranean",
    tags: ["food", "culture", "history", "coast", "relaxed"],
    transportGbp: 270,
    stayPerDayGbp: 66,
    foodAndActivitiesPerDayGbp: 43,
  },
  {
    name: "Split",
    country: "Croatia",
    region: "Europe",
    climate: "warm and coastal",
    tags: ["beach", "nature", "history", "islands", "adventure"],
    transportGbp: 300,
    stayPerDayGbp: 70,
    foodAndActivitiesPerDayGbp: 47,
  },
  {
    name: "Marrakech",
    country: "Morocco",
    region: "Africa",
    climate: "hot and dry",
    tags: ["food", "culture", "markets", "architecture", "adventure"],
    transportGbp: 310,
    stayPerDayGbp: 54,
    foodAndActivitiesPerDayGbp: 39,
  },
  {
    name: "Kyoto",
    country: "Japan",
    region: "Asia",
    climate: "mild and seasonal",
    tags: ["culture", "food", "history", "nature", "architecture"],
    transportGbp: 720,
    stayPerDayGbp: 82,
    foodAndActivitiesPerDayGbp: 58,
  },
];

export function toDestinationOption(
  entry: CatalogEntry,
  request: ParsedRequest,
): DestinationOption {
  const estimatedStayGbp = entry.stayPerDayGbp * request.days;
  const estimatedFoodAndActivitiesGbp =
    entry.foodAndActivitiesPerDayGbp * request.days;
  return {
    name: entry.name,
    country: entry.country,
    region: entry.region,
    climate: entry.climate,
    whyItFits: explainFit(entry, request),
    estimatedTransportGbp: entry.transportGbp,
    estimatedStayGbp,
    estimatedFoodAndActivitiesGbp,
    estimatedTotalGbp:
      entry.transportGbp + estimatedStayGbp + estimatedFoodAndActivitiesGbp,
  };
}

function explainFit(entry: CatalogEntry, request: ParsedRequest): string {
  const reasons: string[] = [];
  if (request.region && entry.region.toLowerCase() === request.region.toLowerCase()) {
    reasons.push(`${entry.region} matches the requested region`);
  }
  if (request.climate && entry.climate.toLowerCase().includes(request.climate.toLowerCase())) {
    reasons.push(`the ${entry.climate} climate suits the brief`);
  }
  const matchedInterests = request.interests.filter((interest) =>
    entry.tags.includes(interest),
  );
  if (matchedInterests.length > 0) {
    reasons.push(`it supports ${matchedInterests.slice(0, 2).join(" and ")}`);
  }
  reasons.push(`the estimate is about £${entry.transportGbp + entry.stayPerDayGbp * request.days + entry.foodAndActivitiesPerDayGbp * request.days}`);
  return `${reasons.join("; ")}.`;
}

export function isCountryExcluded(entry: CatalogEntry, request: ParsedRequest): boolean {
  return request.excludedCountries.some(
    (country) => country.toLowerCase() === entry.country.toLowerCase(),
  );
}
