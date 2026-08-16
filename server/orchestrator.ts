import { randomUUID } from "node:crypto";
import {
  runBudgetDemo,
  runDestinationDemo,
  runItineraryDemo,
  synthesize,
} from "./agents.js";
import { parseRequest, routeRequest } from "./request-parser.js";
import {
  runGeminiBudget,
  runGeminiDestination,
  runGeminiItinerary,
  hasGeminiCredentials,
} from "./llm.js";
import {
  assertBudgetOutput,
  assertDestinationOption,
  assertDestinationOutput,
  assertItineraryOutput,
} from "./validation.js";
import type {
  AgentContribution,
  AgentId,
  AgentMode,
  AgentRunStatus,
  BudgetOutput,
  DestinationOutput,
  DestinationOption,
  ItineraryOutput,
  PlanResult,
  PlanStreamEvent,
} from "../shared/types";

export interface OrchestrationOptions {
  requestId?: string;
  onEvent?: (event: PlanStreamEvent) => void;
  destinationOption?: DestinationOption;
}

export async function orchestrate(prompt: string, options: OrchestrationOptions = {}): Promise<PlanResult> {
  const requestId = options.requestId ?? randomUUID();
  const parsedRequest = parseRequest(prompt);
  if (options.destinationOption) assertDestinationOption(options.destinationOption, parsedRequest);
  const parsed = options.destinationOption
    ? { ...parsedRequest, destinationHint: options.destinationOption.name }
    : parsedRequest;
  const route = routeRequest(parsed);
  const configuredMode = process.env.AGENT_MODE?.toLowerCase() ?? "auto";
  const useGemini = configuredMode === "gemini" || (configuredMode === "auto" && hasGeminiCredentials());
  const warnings = [...parsed.assumptions];
  const contributions: AgentContribution[] = [];
  let destination: DestinationOutput | null = null;
  let destinationContext: DestinationOutput | null = null;
  let itinerary: ItineraryOutput | null = null;
  let budget: BudgetOutput | null = null;
  let usedGemini = false;
  let usedFallback = false;

  emit(options, { type: "request", requestId, mode: useGemini ? "gemini" : "demo" });

  if (route.includes("destination")) {
    if (options.destinationOption) {
      const startedAt = Date.now();
      emit(options, { type: "agent", agent: "destination", status: "running", message: "Destination is working" });
      destination = {
        suggestions: [options.destinationOption],
        selected: options.destinationOption,
        guardrailNote: `${options.destinationOption.name} was selected from the shortlist.`,
      };
      assertDestinationOutput(destination, parsed);
      destinationContext = destination;
      contributions.push({
        agent: "destination",
        label: "Destination Agent",
        status: "complete",
        summary: `Used ${options.destinationOption.name} selected from the shortlist.`,
        durationMs: Date.now() - startedAt,
      });
      emit(options, { type: "agent", agent: "destination", status: "complete", message: "Destination selected" });
    } else {
      const result = await runAgent("destination", options, contributions, async () => {
        if (!useGemini) return runDestinationDemo(parsed);
        const candidate = await runGeminiDestination(parsed);
        assertDestinationOutput(candidate, parsed);
        usedGemini = true;
        return candidate;
      }, () => runDestinationDemo(parsed), warnings);
      destination = result.output;
      destinationContext = destination;
      usedFallback ||= result.fallback;
    }
  }

  if (!destinationContext && (route.includes("itinerary") || route.includes("budget"))) {
    const fallbackRequest = parsed.destinationHint ? parsed : { ...parsed, destinationHint: null };
    destinationContext = runDestinationDemo(fallbackRequest);
    warnings.push("A destination context was needed for the requested downstream agent, so the planner selected one internally.");
  }

  if (route.includes("itinerary") && destinationContext) {
    const result = await runAgent("itinerary", options, contributions, async () => {
      if (!useGemini) return runItineraryDemo(parsed, destinationContext!.selected);
      const candidate = await runGeminiItinerary(parsed, destinationContext!);
      assertItineraryOutput(candidate, parsed);
      usedGemini = true;
      return candidate;
    }, () => runItineraryDemo(parsed, destinationContext!.selected), warnings);
    itinerary = result.output;
    usedFallback ||= result.fallback;
  }

  if (route.includes("budget") && destinationContext) {
    const result = await runAgent("budget", options, contributions, async () => {
      if (!useGemini) return runBudgetDemo(parsed, destinationContext!.selected);
      const candidate = await runGeminiBudget(parsed, destinationContext!, itinerary);
      assertBudgetOutput(candidate, parsed);
      usedGemini = true;
      return candidate;
    }, () => runBudgetDemo(parsed, destinationContext!.selected), warnings);
    budget = result.output;
    usedFallback ||= result.fallback;
  }

  const mode: AgentMode = usedGemini && usedFallback ? "mixed" : usedGemini ? "gemini" : "demo";
  const result: PlanResult = {
    requestId,
    createdAt: new Date().toISOString(),
    mode,
    parsed,
    route,
    destinations: route.includes("destination") ? destination : null,
    itinerary,
    budget,
    synthesis: synthesize(parsed, route.includes("destination") ? destination : null, itinerary, budget),
    contributions,
    warnings: [...new Set(warnings)],
  };
  emit(options, { type: "result", result });
  return result;
}

async function runAgent<T>(
  agent: AgentId,
  options: OrchestrationOptions,
  contributions: AgentContribution[],
  live: () => Promise<T>,
  fallback: () => T,
  warnings: string[],
): Promise<{ output: T; fallback: boolean }> {
  const startedAt = Date.now();
  emit(options, { type: "agent", agent, status: "running", message: `${labelFor(agent)} is working` });
  if (!hasGeminiCredentials() || process.env.AGENT_MODE?.toLowerCase() === "demo") {
    await pause(Number(process.env.DEMO_DELAY_MS ?? 180));
  }
  try {
    const output = await live();
    const durationMs = Date.now() - startedAt;
    contributions.push({ agent, label: labelFor(agent), status: "complete", summary: summaryFor(agent, output), durationMs });
    emit(options, { type: "agent", agent, status: "complete", message: `${labelFor(agent)} completed` });
    return { output, fallback: false };
  } catch {
    const fallbackOutput = fallback();
    const durationMs = Date.now() - startedAt;
    warnings.push("Some details were estimated locally because live travel data was unavailable.");
    contributions.push({ agent, label: labelFor(agent), status: "fallback", summary: summaryFor(agent, fallbackOutput), durationMs });
    emit(options, { type: "agent", agent, status: "error", message: "A local estimate was used" });
    return { output: fallbackOutput, fallback: true };
  }
}

function emit(options: OrchestrationOptions, event: PlanStreamEvent): void {
  options.onEvent?.(event);
}

function labelFor(agent: AgentId): string {
  return agent === "destination" ? "Destination Agent" : agent === "itinerary" ? "Itinerary Agent" : "Budget Agent";
}

function summaryFor(agent: AgentId, output: unknown): string {
  if (agent === "destination") return `Ranked ${(output as DestinationOutput).suggestions.length} constraint-checked options.`;
  if (agent === "itinerary") return `Sequenced ${(output as ItineraryOutput).days.length} days with travel notes.`;
  const budget = output as { totalGbp: number; status: string };
  return `Estimated £${budget.totalGbp} and marked it ${budget.status === "within_budget" ? "within" : "over"} budget.`;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
