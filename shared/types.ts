export type AgentId = "destination" | "itinerary" | "budget";

export type AgentMode = "demo" | "gemini" | "mixed";

export type AgentRunStatus = "queued" | "running" | "complete" | "error";

export interface ParsedRequest {
  raw: string;
  days: number;
  budgetGbp: number;
  budgetProvided: boolean;
  region: string | null;
  climate: string | null;
  travelStyle: string | null;
  interests: string[];
  destinationHint: string | null;
  excludedCountries: string[];
  hardConstraints: string[];
  assumptions: string[];
}

export interface DestinationOption {
  name: string;
  country: string;
  region: string;
  climate: string;
  whyItFits: string;
  estimatedTransportGbp: number;
  estimatedStayGbp: number;
  estimatedFoodAndActivitiesGbp: number;
  estimatedTotalGbp: number;
}

export interface DestinationOutput {
  suggestions: DestinationOption[];
  selected: DestinationOption;
  guardrailNote: string;
}

export interface ItineraryDay {
  day: number;
  title: string;
  plan: string;
  travelNote: string;
  confidence: "high" | "medium";
}

export interface ItineraryOutput {
  destination: string;
  days: ItineraryDay[];
  uncertaintyNote: string;
}

export interface BudgetOutput {
  currency: "GBP";
  budgetGbp: number;
  transportGbp: number;
  accommodationGbp: number;
  foodAndActivitiesGbp: number;
  contingencyGbp: number;
  totalGbp: number;
  status: "within_budget" | "over_budget";
  overageGbp: number;
  alternative: string;
}

export interface AgentContribution {
  agent: AgentId;
  label: string;
  status: "complete" | "fallback";
  summary: string;
  durationMs: number;
}

export interface PlanResult {
  requestId: string;
  createdAt: string;
  mode: AgentMode;
  parsed: ParsedRequest;
  route: AgentId[];
  destinations: DestinationOutput | null;
  itinerary: ItineraryOutput | null;
  budget: BudgetOutput | null;
  synthesis: string;
  contributions: AgentContribution[];
  warnings: string[];
}

export interface AuditRecord {
  id: string;
  createdAt: string;
  prompt: string;
  route: AgentId[];
  mode: AgentMode;
  status: "complete" | "error";
  destination: string | null;
  totalGbp: number | null;
  durationMs: number;
  error?: string;
}

export interface ObservabilityRecord {
  id: string;
  createdAt: string;
  route: AgentId[];
  mode: AgentMode;
  status: AuditRecord["status"];
  destination: string | null;
  totalGbp: number | null;
  durationMs: number;
}

export interface ObservabilitySnapshot {
  totalRequests: number;
  completedRequests: number;
  errorRequests: number;
  averageDurationMs: number;
  modeCounts: Record<AgentMode, number>;
  routeCounts: Record<string, number>;
  recent: ObservabilityRecord[];
}

export type PlanStreamEvent =
  | {
      type: "request";
      requestId: string;
      mode: AgentMode;
    }
  | {
      type: "agent";
      agent: AgentId;
      status: AgentRunStatus;
      message: string;
    }
  | {
      type: "result";
      result: PlanResult;
    }
  | {
      type: "error";
      message: string;
    };
