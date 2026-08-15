import { useEffect, useMemo, useState, type FormEvent } from "react";
import { loadAudit, streamPlan } from "./api";
import type {
  AgentId,
  AgentRunStatus,
  AuditRecord,
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

interface ActivityState {
  status: AgentRunStatus | "fallback";
  message: string;
}

const EMPTY_ACTIVITY: Record<AgentId, ActivityState> = {
  destination: { status: "queued", message: "Waiting for the brief" },
  itinerary: { status: "queued", message: "Waiting for destination context" },
  budget: { status: "queued", message: "Waiting for the route" },
};

export default function App() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const refreshAudit = async () => {
    try {
      setAudit(await loadAudit());
      setAuditError(null);
    } catch (refreshError) {
      setAuditError(refreshError instanceof Error ? refreshError.message : "Audit history is unavailable.");
    }
  };

  useEffect(() => {
    void refreshAudit();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (trimmed.length < 12) {
      setError("Give the planner a little more detail - at least 12 characters.");
      return;
    }
    setIsPlanning(true);
    setError(null);
    setPlan(null);
    setActivity(EMPTY_ACTIVITY);
    try {
      const result = await streamPlan(trimmed, handleStreamEvent);
      setPlan(result);
      await refreshAudit();
    } catch (planningError) {
      setError(planningError instanceof Error ? planningError.message : "The plan could not be completed.");
    } finally {
      setIsPlanning(false);
    }
  };

  const handleStreamEvent = (event: PlanStreamEvent) => {
    if (event.type === "agent") {
      setActivity((current) => ({
        ...current,
        [event.agent]: {
          status: event.status === "error" ? "fallback" : event.status,
          message: event.message,
        },
      }));
    }
    if (event.type === "result") {
      setPlan(event.result);
      const next = { ...EMPTY_ACTIVITY };
      for (const agent of AGENTS) {
        const contribution = event.result.contributions.find((item) => item.agent === agent);
        if (contribution) {
          next[agent] = {
            status: contribution.status === "fallback" ? "fallback" : "complete",
            message: contribution.status === "fallback" ? "Safe local fallback used" : contribution.summary,
          };
        } else {
          next[agent] = { status: "queued", message: "Not needed for this route" };
        }
      }
      setActivity(next);
    }
  };

  const activeAgents = useMemo(() => plan?.route ?? AGENTS, [plan]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">T/</span>
          <span className="brand-name">Trip Trace</span>
          <span className="brand-subtitle">cross-collaborative planner</span>
        </div>
        <div className="topbar-meta">
          <span className="live-dot" aria-hidden="true" />
          <span>local, inspectable, free to run</span>
        </div>
      </header>

      <main>
        <section className="command-zone" aria-labelledby="page-title">
          <div className="section-kicker">01 / brief the route</div>
          <div className="command-copy">
            <h1 id="page-title">A trip plan with its reasoning intact.</h1>
            <p>Give the planner a loose brief. Specialist agents will make the route, the days, and the money legible before you book anything.</p>
          </div>
          <form className="brief-form" onSubmit={handleSubmit}>
            <label htmlFor="trip-brief">Your trip brief</label>
            <textarea
              id="trip-brief"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. Five days somewhere warm in Europe for under £1,500..."
              maxLength={2_000}
              disabled={isPlanning}
              rows={4}
            />
            <div className="brief-footer">
              <span className="character-count">{prompt.length} / 2,000</span>
              <button type="submit" className="primary-button" disabled={isPlanning}>
                {isPlanning ? "Tracing the route" : "Build the plan"}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
          <div className="example-row" aria-label="Example briefs">
            <span className="example-label">Try a brief</span>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="example-button" onClick={() => setPrompt(example)} disabled={isPlanning}>
                {example.split(" ").slice(0, 5).join(" ")}…
              </button>
            ))}
          </div>
          {error && <div className="error-banner" role="alert">{error}</div>}
        </section>

        <section className="workspace-grid" aria-label="Trip planning workspace">
          <aside className="trace-panel" aria-labelledby="trace-title">
            <div className="section-kicker">02 / agent trace</div>
            <div className="panel-heading-row">
              <h2 id="trace-title">What is happening</h2>
              <span className="trace-count">{activeAgents.length} agents</span>
            </div>
            <p className="panel-intro">Every contribution is named. The order is part of the answer.</p>
            <div className="agent-list">
              {AGENTS.map((agent, index) => {
                const item = activity[agent];
                const isIncluded = activeAgents.includes(agent);
                return (
                  <div className={`agent-row ${item.status === "running" ? "is-running" : ""} ${!isIncluded ? "is-muted" : ""}`} key={agent}>
                    <div className="agent-number">0{index + 1}</div>
                    <div className="agent-state" aria-hidden="true"><span /></div>
                    <div className="agent-copy">
                      <strong>{AGENT_LABELS[agent]} Agent</strong>
                      <span>{isIncluded ? item.message : "Not needed for this brief"}</span>
                    </div>
                    <span className={`status-label status-${item.status}`}>{statusLabel(item.status)}</span>
                  </div>
                );
              })}
            </div>
            <div className="trace-footnote">
              <span className="tiny-rule" />
              <span>Hard constraints are checked in code after every model-shaped result.</span>
            </div>
            <AuditPanel audit={audit} error={auditError} />
          </aside>

          <section className="result-panel" aria-labelledby="result-title">
            <div className="section-kicker">03 / finished route</div>
            {plan ? <PlanView plan={plan} /> : <EmptyPlan isPlanning={isPlanning} />}
          </section>
        </section>
      </main>

      <footer className="footer">
        <span>Trip Trace / take-home build</span>
        <span>Estimates are planning aids, not live availability.</span>
      </footer>
    </div>
  );
}

function EmptyPlan({ isPlanning }: { isPlanning: boolean }) {
  return (
    <div className={`empty-plan ${isPlanning ? "is-planning" : ""}`}>
      <div className="empty-orbit" aria-hidden="true"><span /><span /><span /></div>
      <h2 id="result-title">Your route will land here.</h2>
      <p>{isPlanning ? "The agents are passing structured context downstream. Watch the trace on the left." : "A clear answer starts with a clear brief. The planner will keep the assumptions and trade-offs visible."}</p>
      <div className="empty-specimen">
        <span>DESTINATION</span><i />
        <span>ITINERARY</span><i />
        <span>BUDGET</span>
      </div>
    </div>
  );
}

function PlanView({ plan }: { plan: PlanResult }) {
  const selected = plan.destinations?.selected;
  return (
    <div className="plan-view">
      <div className="plan-heading">
        <div>
          <div className="plan-meta-row">
            <span className="mode-badge"><span className="mode-dot" />{modeLabel(plan.mode)}</span>
            <span>{plan.route.map((agent) => AGENT_LABELS[agent]).join(" → ")}</span>
          </div>
          <h2 id="result-title">{selected ? `${selected.name}, shaped around your brief.` : "A route shaped around your brief."}</h2>
        </div>
        <span className="request-id">trace {plan.requestId.slice(0, 8)}</span>
      </div>
      <p className="synthesis">{plan.synthesis}</p>

      <div className="constraint-strip">
        <span className="strip-label">Read as</span>
        <span>{plan.parsed.days} days</span>
        <span>£{plan.parsed.budgetGbp.toLocaleString("en-GB")} ceiling</span>
        {plan.parsed.region && <span>{plan.parsed.region}</span>}
        {plan.parsed.climate && <span>{plan.parsed.climate}</span>}
        {plan.parsed.excludedCountries.length > 0 && <span className="constraint-alert">excluding {plan.parsed.excludedCountries.join(", ")}</span>}
      </div>

      {plan.destinations && (
        <section className="plan-section">
          <SectionHeading number="A" title="Destination signal" detail="why these options survived the brief" />
          <div className="destination-grid">
            {plan.destinations.suggestions.map((destination, index) => (
              <article className={`destination-option ${index === 0 ? "is-selected" : ""}`} key={`${destination.name}-${destination.country}`}>
                <div className="option-topline"><span>0{index + 1}</span>{index === 0 && <span className="selected-label">selected</span>}</div>
                <h3>{destination.name}<small>{destination.country}</small></h3>
                <p>{destination.whyItFits}</p>
                <span className="option-estimate">from £{destination.estimatedTotalGbp.toLocaleString("en-GB")}</span>
              </article>
            ))}
          </div>
          <p className="guardrail-note"><span>Guardrail</span>{plan.destinations.guardrailNote}</p>
        </section>
      )}

      {plan.itinerary && (
        <section className="plan-section">
          <SectionHeading number="B" title="Days with room to breathe" detail="one geographic anchor per day" />
          <div className="itinerary-list">
            {plan.itinerary.days.map((day) => (
              <article className="day-row" key={day.day}>
                <span className="day-number">{String(day.day).padStart(2, "0")}</span>
                <div className="day-body">
                  <div className="day-title-row"><h3>{day.title}</h3><span className={`confidence confidence-${day.confidence}`}>{day.confidence} confidence</span></div>
                  <p>{day.plan}</p>
                  <span className="travel-note"><span aria-hidden="true">↳</span>{day.travelNote}</span>
                </div>
              </article>
            ))}
          </div>
          <p className="uncertainty-note"><span>Uncertainty</span>{plan.itinerary.uncertaintyNote}</p>
        </section>
      )}

      {plan.budget && (
        <section className="plan-section budget-section">
          <SectionHeading number="C" title="Money, without the quiet overage" detail="transparent estimate in GBP" />
          <div className="budget-layout">
            <div className={`budget-total ${plan.budget.status === "over_budget" ? "is-over" : ""}`}>
              <span>{plan.budget.status === "within_budget" ? "inside ceiling" : "needs adjustment"}</span>
              <strong>£{plan.budget.totalGbp.toLocaleString("en-GB")}</strong>
              <small>against £{plan.budget.budgetGbp.toLocaleString("en-GB")}</small>
            </div>
            <div className="budget-lines">
              <BudgetLine label="Transport" value={plan.budget.transportGbp} />
              <BudgetLine label="Accommodation" value={plan.budget.accommodationGbp} />
              <BudgetLine label="Food + activities" value={plan.budget.foodAndActivitiesGbp} />
              <BudgetLine label="10% contingency" value={plan.budget.contingencyGbp} />
            </div>
          </div>
          <div className={`budget-callout ${plan.budget.status === "over_budget" ? "is-over" : ""}`}>
            <span>{plan.budget.status === "within_budget" ? "Buffer" : `£${plan.budget.overageGbp} over`}</span>
            <p>{plan.budget.alternative}</p>
          </div>
        </section>
      )}

      {(plan.warnings.length > 0 || plan.parsed.assumptions.length > 0) && (
        <section className="notes-section">
          <SectionHeading number="D" title="Assumptions to check" detail="what the planner could not know" />
          <ul>
            {[...new Set([...plan.parsed.assumptions, ...plan.warnings])].map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function SectionHeading({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="section-heading"><span>{number}</span><div><h3>{title}</h3><p>{detail}</p></div></div>;
}

function BudgetLine({ label, value }: { label: string; value: number }) {
  return <div className="budget-line"><span>{label}</span><span className="budget-line-rule" /><strong>£{value.toLocaleString("en-GB")}</strong></div>;
}

function AuditPanel({ audit, error }: { audit: AuditRecord[]; error: string | null }) {
  return (
    <div className="audit-panel">
      <div className="panel-heading-row"><h2>Audit trail</h2><span className="trace-count">{audit.length} recent</span></div>
      {error ? <p className="audit-empty">{error}</p> : audit.length === 0 ? <p className="audit-empty">Completed requests will appear here.</p> : (
        <div className="audit-list">
          {audit.slice(0, 5).map((record) => (
            <div className="audit-row" key={record.id}>
              <span className={`audit-status audit-${record.status}`} aria-label={record.status} />
              <div><strong>{record.destination ?? "Unresolved"}</strong><span>{record.route.map((agent) => AGENT_LABELS[agent][0]).join(" / ")} · {formatDuration(record.durationMs)}</span></div>
              <time dateTime={record.createdAt}>{formatRelativeTime(record.createdAt)}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: ActivityState["status"]): string {
  if (status === "running") return "working";
  if (status === "complete") return "done";
  if (status === "fallback") return "fallback";
  if (status === "error") return "error";
  return "queued";
}

function modeLabel(mode: PlanResult["mode"]): string {
  return mode === "gemini" ? "Gemini route" : mode === "mixed" ? "Gemini + safe fallback" : "Local demo route";
}

function formatDuration(durationMs: number): string {
  return durationMs < 1_000 ? `${durationMs}ms` : `${(durationMs / 1_000).toFixed(1)}s`;
}

function formatRelativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes === 1) return "1m";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}
