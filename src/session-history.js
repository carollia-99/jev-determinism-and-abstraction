let entries = [];
let nextId = 1;
const listeners = new Set();

function notify() {
  const snapshot = getSessionHistory();
  listeners.forEach((listener) => listener(snapshot));
}

export function recordSessionRequest({ prompt, outcome, steps, source = "jev", model = null, autoRoute = null, snapshot = null }) {
  const entry = Object.freeze({
    id: nextId++,
    prompt,
    outcome,
    source,
    model,
    autoRoute: autoRoute ? Object.freeze({ ...autoRoute }) : null,
    snapshot: snapshot ? Object.freeze({ ...snapshot }) : null,
    steps: Object.freeze(steps.filter(Boolean).map((step) => Object.freeze({ ...step }))),
  });
  entries = [...entries, entry];
  notify();
  return entry;
}

export function getSessionHistory() {
  return [...entries];
}

export function getSessionTotals(history = entries) {
  const steps = history.flatMap((entry) => entry.steps);
  const knownTokenSteps = steps.filter((step) => Number.isFinite(step.tokens?.total));
  const pricedSteps = steps.filter((step) => Number.isFinite(step.costUsd));
  return {
    calls: steps.length,
    latencyMs: steps.reduce((total, step) => total + (Number.isFinite(step.latencyMs) ? step.latencyMs : 0), 0),
    tokens: knownTokenSteps.reduce((total, step) => total + step.tokens.total, 0),
    tokenizedCalls: knownTokenSteps.length,
    costUsd: pricedSteps.reduce((total, step) => total + step.costUsd, 0),
    pricedCalls: pricedSteps.length,
  };
}

export function getRequestTotals(entry) {
  return getSessionTotals(entry ? [entry] : []);
}

export function subscribeToSessionHistory(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearSessionHistory() {
  entries = [];
  nextId = 1;
  notify();
}
