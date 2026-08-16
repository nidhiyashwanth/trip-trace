import { useEffect, useMemo, useState, type FormEvent } from "react";
import { loadAudit, loadMetrics, rememberAudit, streamPlan } from "./api";
import type {
  AgentId,
  AgentRunStatus,
  AuditRecord,
  DestinationOption,
  ObservabilitySnapshot,
  PlanResult,
  PlanStreamEvent,
} from "../shared/types";

const DEFAULT_PROMPT = "Plan five days somewhere warm in Europe for under £1,500 with food, culture, and a relaxed pace. Do not recommend Spain.";
const EXAMPLES = [
  "Plan five days somewhere warm in Europe for under £1,500 with food and culture.",
  "I have four nights in Lisbon. Build a relaxed itinerary with architecture and local markets.",
  "Suggest a warm, affordable destination for a food-focused five-day trip under £1,200.",
];
const AGENTS: AgentId[] = ["destination", "itinerary", "budget"];
const AGENT_LABELS: Record<AgentId, string> = {
  destination: "Destination",
  itinerary: "Itinerary",
  budget: "Budget",
};

type ActivityState = AgentRunStatus | "fallback";
type UserRole = "traveler" | "operator";

const EMPTY_ACTIVITY: Record<AgentId, ActivityState> = {
  destination: "queued",
  itinerary: "queued",
  budget: "queued",
};

function initialRole(): UserRole {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("role") === "operator") {
    return "operator";
  }
  return "traveler";
}

export default function App() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [role, setRole] = useState<UserRole>(() => initialRole());
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [metrics, setMetrics] = useState<ObservabilitySnapshot | null>(null);
  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const refreshAudit = async () => {
    try {
      setAudit(await loadAudit());
      setAuditError(null);
    } catch {
      setAuditError("Recent requests are unavailable right now.");
    }
  };

  const refreshMetrics = async () => {
    try {
      setMetrics(await loadMetrics());
      setMetricsError(null);
    } catch {
      setMetricsError("Operational metrics are unavailable right now.");
    }
  };

  useEffect(() => {
    void refreshAudit();
    void refreshMetrics();
  }, []);

  const handleRoleChange = (nextRole: UserRole) => {
    setRole(nextRole);
    const url = new URL(window.location.href);
    if (nextRole === "operator") url.searchParams.set("role", "operator");
    else url.searchParams.delete("role");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const handleStreamEvent = (event: PlanStreamEvent) => {
    if (event.type === "agent") {
      setActivity((current) => ({
        ...current,
        [event.agent]: event.status === "error" ? "fallback" : event.status,
      }));
    }
    if (event.type === "result") {
      setPlan(event.result);
      setSelectedDestination(event.result.destinations?.selected.name ?? null);
      const next = { ...EMPTY_ACTIVITY };
      for (const agent of AGENTS) {
        const contribution = event.result.contributions.find((item) => item.agent === agent);
        next[agent] = contribution
          ? contribution.status === "fallback" ? "fallback" : "complete"
          : "queued";
      }
      setActivity(next);
    }
  };

  const executePlan = async (requestPrompt: string, destination?: DestinationOption) => {
    const startedAt = Date.now();
    setIsPlanning(true);
    setError(null);
    setPlan(null);
    setActivity(EMPTY_ACTIVITY);
    try {
      const result = await streamPlan(requestPrompt, handleStreamEvent, destination);
      setPlan(result);
      setSelectedDestination(result.destinations?.selected.name ?? destination?.name ?? null);
      rememberAudit({
        id: result.requestId,
        createdAt: result.createdAt,
        prompt: requestPrompt,
        route: result.route,
        mode: result.mode,
        status: "complete",
        destination: result.destinations?.selected.name ?? null,
        totalGbp: result.budget?.totalGbp ?? null,
        durationMs: Date.now() - startedAt,
      });
      await Promise.all([refreshAudit(), refreshMetrics()]);
    } catch (planningError) {
      setError(planningError instanceof Error ? planningError.message : "The plan could not be completed.");
    } finally {
      setIsPlanning(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (trimmed.length < 12) {
      setError("Tell us a little more about the trip you have in mind.");
      return;
    }
    setSelectedDestination(null);
    void executePlan(trimmed);
  };

  const handleDestinationSelect = (destination: DestinationOption) => {
    if (!plan || isPlanning || destination.name === selectedDestination) return;
    setSelectedDestination(destination.name);
    void executePlan(prompt.trim(), destination);
  };

  const activeAgents = useMemo(() => plan?.route ?? AGENTS, [plan]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Trip Trace home">
          <span className="brand-mark" aria-hidden="true">T/</span>
          <span className="brand-name">Trip Trace</span>
        </a>
        <div className="topbar-tools">
          <span className="topbar-label">{role === "operator" ? "Operator view" : "AI trip planner"}</span>
          <div className="role-switcher" aria-label="Choose user role">
            <button type="button" className={role === "traveler" ? "is-active" : ""} aria-pressed={role === "traveler"} onClick={() => handleRoleChange("traveler")}>Traveler</button>
            <button type="button" className={role === "operator" ? "is-active" : ""} aria-pressed={role === "operator"} onClick={() => handleRoleChange("operator")}>Operator</button>
          </div>
        </div>
      </header>

      <main id="top" className="planner-shell">
        {role === "operator" ? (
          <OperatorWorkspace metrics={metrics} error={metricsError} />
        ) : (
          <>
          <section className="brief-panel" aria-labelledby="page-title">
          <div className="brief-copy">
            <p className="eyebrow">Trip brief</p>
            <h1 id="page-title">Plan the trip from one clear request.</h1>
            <p>Describe where you want to go, how long you have, and what matters. The planner will return a destination, itinerary, and budget.</p>
          </div>
          <form className="brief-form" onSubmit={handleSubmit}>
            <label htmlFor="trip-brief">Your request</label>
            <textarea
              id="trip-brief"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Five days somewhere warm, with good food and time to wander..."
              maxLength={2_000}
              disabled={isPlanning}
              rows={5}
            />
            <div className="brief-footer">
              <span className="character-count">{prompt.length} / 2,000</span>
              <button type="submit" className="primary-button" disabled={isPlanning}>
                {isPlanning ? "Building the plan" : "Build the plan"}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
          <div className="example-row" aria-label="Example trip requests">
            <span className="example-label">Try an example</span>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="example-button" onClick={() => setPrompt(example)} disabled={isPlanning}>
                {example.split(" ").slice(0, 7).join(" ")}…
              </button>
            ))}
          </div>
          {error && <div className="error-banner" role="alert">{error}</div>}
          </section>

          <section className="workspace-grid" aria-label="Trip planning workspace">
          <aside className="sidebar">
            <ActivityPanel agents={activeAgents} activity={activity} isPlanning={isPlanning} hasPlan={Boolean(plan)} />
            <AuditPanel audit={audit} error={auditError} />
          </aside>
          <section className="result-panel" aria-labelledby="result-title" aria-live="polite">
            {plan ? (
              <PlanView
                plan={plan}
                selectedDestination={selectedDestination}
                onSelectDestination={handleDestinationSelect}
                isPlanning={isPlanning}
              />
            ) : (
              <EmptyPlan isPlanning={isPlanning} />
            )}
          </section>
          </section>
          </>
        )}
      </main>

      <footer className="footer">Estimates are planning aids, not live availability.</footer>
    </div>
  );
}

function ActivityPanel({
  agents,
  activity,
  isPlanning,
  hasPlan,
}: {
  agents: AgentId[];
  activity: Record<AgentId, ActivityState>;
  isPlanning: boolean;
  hasPlan: boolean;
}) {
  return (
    <section className="activity-panel" aria-labelledby="activity-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Transparency</p><h2 id="activity-title">Plan status</h2></div>
        <span className="panel-state">{isPlanning ? "Working" : hasPlan ? "Complete" : "Ready"}</span>
      </div>
      <ol className="agent-list">
        {agents.map((agent, index) => (
          <li className={`agent-row status-${activity[agent]}`} key={agent}>
            <span className="agent-number">0{index + 1}</span>
            <div><strong>{AGENT_LABELS[agent]}</strong><span>{statusLabel(activity[agent], isPlanning)}</span></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EmptyPlan({ isPlanning }: { isPlanning: boolean }) {
  return (
    <div className="empty-plan">
      <p className="eyebrow">Plan output</p>
      <h2 id="result-title">{isPlanning ? "Building your plan." : "Your plan will appear here."}</h2>
      <p>{isPlanning ? "The agents are working through your request." : "Submit a request to see destination options, day-by-day planning, budget, and assumptions."}</p>
    </div>
  );
}

function OperatorWorkspace({
  metrics,
  error,
}: {
  metrics: ObservabilitySnapshot | null;
  error: string | null;
}) {
  const routeEntries = metrics
    ? Object.entries(metrics.routeCounts).sort((left, right) => right[1] - left[1])
    : [];
  const modeEntries = metrics ? Object.entries(metrics.modeCounts) : [];

  return (
    <section className="operator-workspace" aria-labelledby="operator-title">
      <div className="operator-heading">
        <div>
          <p className="eyebrow">Operator view</p>
          <h1 id="operator-title">Planning activity.</h1>
        </div>
        <p>Review request outcomes, routing, and timing in a read-only operations view.</p>
      </div>

      {error ? (
        <div className="error-banner operator-error" role="alert">{error}</div>
      ) : metrics ? (
        <>
          <div className="metrics-grid" aria-label="Planning metrics">
            <div className="metric-item"><span>Requests</span><strong>{metrics.totalRequests}</strong></div>
            <div className="metric-item"><span>Completed</span><strong>{metrics.completedRequests}</strong></div>
            <div className="metric-item"><span>Errors</span><strong>{metrics.errorRequests}</strong></div>
            <div className="metric-item"><span>Average duration</span><strong>{formatDurationMs(metrics.averageDurationMs)}</strong></div>
          </div>

          <div className="operator-columns">
            <section className="operator-section" aria-labelledby="operator-log-title">
              <div className="section-heading"><h2 id="operator-log-title">Recent request log</h2><span>Redacted operational record</span></div>
              {metrics.recent.length === 0 ? <p className="operator-empty">Completed requests will appear here.</p> : (
                <div className="operator-log">
                  {metrics.recent.map((record) => (
                    <div className="operator-log-row" key={record.id}>
                      <div>
                        <strong>{record.destination ?? "Itinerary request"}</strong>
                        <span>{record.route.length > 0 ? record.route.join(" → ") : "No agent route"}</span>
                      </div>
                      <div className="operator-log-meta">
                        <strong className={`audit-status audit-${record.status}`}>{record.status === "complete" ? "Complete" : "Needs attention"}</strong>
                        <span>{formatRelativeTime(record.createdAt)} · {formatDurationMs(record.durationMs)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="operator-section" aria-labelledby="operator-breakdown-title">
              <div className="section-heading"><h2 id="operator-breakdown-title">Route mix</h2><span>Requests by orchestration path</span></div>
              <div className="operator-breakdown">
                {routeEntries.length === 0 ? <p className="operator-empty">No route data yet.</p> : routeEntries.map(([route, count]) => (
                  <div className="operator-breakdown-row" key={route}><span>{route}</span><strong>{count}</strong></div>
                ))}
              </div>
              <div className="operator-mode-block">
                <div className="section-heading"><h3>Run mode</h3><span>Provider path</span></div>
                <div className="operator-breakdown">
                  {modeEntries.map(([mode, count]) => (
                    <div className="operator-breakdown-row" key={mode}><span>{mode}</span><strong>{count}</strong></div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="operator-empty">Loading planning activity…</div>
      )}
    </section>
  );
}

function PlanView({
  plan,
  selectedDestination,
  onSelectDestination,
  isPlanning,
}: {
  plan: PlanResult;
  selectedDestination: string | null;
  onSelectDestination: (destination: DestinationOption) => void;
  isPlanning: boolean;
}) {
  const selected = plan.destinations?.selected;
  const notes = [...new Set([...plan.parsed.assumptions, ...plan.warnings].map(toUserFacingNote))];
  const budgetCeiling = plan.budget?.budgetGbp ?? plan.parsed.budgetGbp;
  const destinationName = selected?.name ?? plan.itinerary?.destination ?? "Your itinerary";
  const activeSelection = selectedDestination ?? selected?.name ?? null;
  const hasAlternatives = Boolean(plan.destinations && plan.destinations.suggestions.length > 1);

  return (
    <div className="plan-view">
      <div className="result-heading">
        <div>
          <p className="eyebrow">Plan output</p>
          <h2 id="result-title">{destinationName}</h2>
        </div>
        <div className="summary-facts" aria-label="Plan summary">
          <span><strong>{plan.parsed.days}</strong> days</span>
          <span><strong>£{budgetCeiling.toLocaleString("en-GB")}</strong> ceiling</span>
        </div>
      </div>

      <p className="synthesis">{plan.synthesis}</p>

      <div className="contributor-line" aria-label="Agents that contributed to this plan">
        <span>Contributors</span>
        {plan.contributions.map((contribution) => <strong key={contribution.agent}>{contribution.label}</strong>)}
      </div>

      <div className="constraint-strip" aria-label="Trip constraints">
        <span>{plan.parsed.days} days</span>
        <span>£{budgetCeiling.toLocaleString("en-GB")} ceiling</span>
        {plan.parsed.region && <span>{plan.parsed.region}</span>}
        {plan.parsed.climate && <span>{plan.parsed.climate}</span>}
        {plan.parsed.excludedCountries.length > 0 && <span className="constraint-alert">{plan.parsed.excludedCountries.join(", ")} excluded</span>}
      </div>

      {plan.itinerary && (
        <section className="plan-section">
          <div className="section-heading"><h3>Day by day</h3><span>Realistic sequencing and travel notes</span></div>
          <div className="itinerary-list">
            {plan.itinerary.days.map((day) => (
              <article className="day-row" key={day.day}>
                <span className="day-number">{String(day.day).padStart(2, "0")}</span>
                <div className="day-body">
                  <h4>{day.title}</h4>
                  <p>{day.plan}</p>
                  <p className="travel-note">{day.travelNote}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="uncertainty-note">{plan.itinerary.uncertaintyNote}</p>
        </section>
      )}

      {plan.budget && (
        <section className="plan-section budget-section">
          <div className="section-heading"><h3>Budget</h3><span>Estimate in GBP</span></div>
          <div className="budget-layout">
            <div className={`budget-total ${plan.budget.status === "over_budget" ? "is-over" : ""}`}>
              <span>Total estimate</span>
              <strong>£{plan.budget.totalGbp.toLocaleString("en-GB")}</strong>
              <small>{plan.budget.status === "within_budget" ? `£${Math.max(0, plan.budget.budgetGbp - plan.budget.totalGbp).toLocaleString("en-GB")} left` : `£${plan.budget.overageGbp.toLocaleString("en-GB")} over`}</small>
            </div>
            <div className="budget-lines">
              <BudgetLine label="Transport" value={plan.budget.transportGbp} />
              <BudgetLine label="Accommodation" value={plan.budget.accommodationGbp} />
              <BudgetLine label="Food + activities" value={plan.budget.foodAndActivitiesGbp} />
              <BudgetLine label="Contingency" value={plan.budget.contingencyGbp} />
            </div>
          </div>
          <div className={`budget-callout ${plan.budget.status === "over_budget" ? "is-over" : ""}`}>
            <strong>{plan.budget.status === "within_budget" ? "Within budget" : "Over budget"}</strong>
            <p>{plan.budget.alternative}</p>
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section className="notes-section">
          <div className="section-heading"><h3>Assumptions and uncertainty</h3><span>Check before booking</span></div>
          <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
      )}

      {plan.destinations && (
        <section className="plan-section">
          <div className="section-heading">
            <h3>{hasAlternatives ? "Destination options" : "Selected destination"}</h3>
            {hasAlternatives && <span>Choose one to rebuild the plan</span>}
          </div>
          <div className="destination-list">
            {plan.destinations.suggestions.map((destination, index) => {
              const isSelected = activeSelection?.toLowerCase() === destination.name.toLowerCase();
              const content = (
                <>
                  <span className="option-number">0{index + 1}</span>
                  <span className="option-main"><strong>{destination.name}</strong><small>{destination.country} · from £{destination.estimatedTotalGbp.toLocaleString("en-GB")}</small><span>{destination.whyItFits}</span></span>
                  <span className="option-action">{isSelected ? "Selected" : "Choose"} {hasAlternatives && <span aria-hidden="true">↗</span>}</span>
                </>
              );
              return hasAlternatives ? (
                <button
                  type="button"
                  className={`destination-option ${isSelected ? "is-selected" : ""}`}
                  key={`${destination.name}-${destination.country}`}
                  aria-pressed={isSelected}
                  disabled={isPlanning}
                  onClick={() => onSelectDestination(destination)}
                >
                  {content}
                </button>
              ) : (
                <div
                  className={`destination-option ${isSelected ? "is-selected" : ""}`}
                  key={`${destination.name}-${destination.country}`}
                  aria-label={`${destination.name} selected`}
                >
                  {content}
                </div>
              );
            })}
          </div>
          <p className="guardrail-note">{plan.destinations.guardrailNote}</p>
        </section>
      )}
    </div>
  );
}

function BudgetLine({ label, value }: { label: string; value: number }) {
  return <div className="budget-line"><span>{label}</span><span className="budget-line-rule" /><strong>£{value.toLocaleString("en-GB")}</strong></div>;
}

function AuditPanel({ audit, error }: { audit: AuditRecord[]; error: string | null }) {
  return (
    <section className="audit-panel" aria-labelledby="audit-title">
      <div className="panel-heading"><div><p className="eyebrow">Persistence</p><h2 id="audit-title">Recent requests</h2></div></div>
      {error ? <p className="audit-empty">{error}</p> : audit.length === 0 ? <p className="audit-empty">Completed requests will appear here.</p> : (
        <div className="audit-list">
          {audit.slice(0, 6).map((record) => (
            <div className="audit-row" key={record.id}>
              <div><strong>{record.destination ?? "Itinerary request"}</strong><span>{formatRelativeTime(record.createdAt)}</span></div>
              <span className={`audit-status audit-${record.status}`}>{record.status === "complete" ? "Complete" : "Needs attention"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function statusLabel(status: ActivityState, isPlanning: boolean): string {
  if (status === "running") return "Working";
  if (status === "complete") return "Complete";
  if (status === "fallback") return "Estimated locally";
  return isPlanning ? "Next" : "Ready";
}

function toUserFacingNote(note: string): string {
  if (note.includes("upstream request failed") || note.includes("deterministic fallback") || note.includes("local estimate")) {
    return "Some details were estimated locally because live travel data was unavailable.";
  }
  return note;
}

function formatRelativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 120) return "1 hour ago";
  return `${Math.floor(minutes / 60)} hours ago`;
}

function formatDurationMs(value: number): string {
  return value < 1_000 ? `${value}ms` : `${(value / 1_000).toFixed(1)}s`;
}
