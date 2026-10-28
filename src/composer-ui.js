import { getArtSpec, resetArtSpec, subscribeToArtSpec, updateArtSpec } from "./art-spec-state.js";
import { requestArtComposition } from "./composition-client.js";
import { clearSessionHistory, getSessionHistory, getSessionTotals, recordSessionRequest, subscribeToSessionHistory } from "./session-history.js";
import { ART_DECISION_COUNT } from "../shared/art-grammar.js";

const DIMENSIONS = ["composition", "palette", "marks", "space", "motion"];
const MAX_DECISION_COUNT = ART_DECISION_COUNT + 8;
const titleCase = (value) => String(value).toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const formatCost = (value) => Number.isFinite(value) ? `$${value.toFixed(6)}` : "cost —";
const formatTokens = (value) => Number.isFinite(value) ? `${value.toLocaleString()} tok` : "tokens —";

function defaultHighlights(spec) {
  return {
    composition: { choice: spec.composition, confidence: null },
    palette: { choice: `${spec.gradientStartColor} → ${spec.gradientEndColor}`, confidence: null },
    marks: { choice: spec.layers[2].primitive, confidence: null },
    space: { choice: spec.negativeSpace, confidence: null },
    motion: { choice: spec.motion, confidence: null },
  };
}

export function mountComposer({ promptForm, promptInput, promptMessage, status, trace, sessionLedger, examples }) {
  const submitButton = promptForm.querySelector("button[type='submit']");
  const traceSource = trace.querySelector("[data-trace-source]");
  const traceMeta = trace.querySelector("[data-trace-meta]");
  const traceVerdict = trace.querySelector("[data-trace-verdict]");
  const traceAverage = trace.querySelector("[data-trace-average]");
  const artSpecCode = trace.querySelector("[data-art-spec]");
  const traceRows = new Map([...trace.querySelectorAll("[data-trace-dimension]")].map((row) => [row.dataset.traceDimension, row]));
  const ledgerTotal = sessionLedger.querySelector("[data-ledger-total]");
  const ledgerEmpty = sessionLedger.querySelector("[data-ledger-empty]");
  const ledgerList = sessionLedger.querySelector("[data-ledger-list]");
  const resetButton = sessionLedger.querySelector("[data-reset-session]");

  function renderSpec(spec) {
    status.textContent = `${titleCase(spec.composition)} · ${spec.gradientStartColor.toLowerCase()} → ${spec.gradientEndColor.toLowerCase()} · ${spec.atmosphere.toLowerCase()}`;
    artSpecCode.textContent = JSON.stringify(spec, null, 2);
  }

  function renderTrace({ source = "Fixed art grammar", model = "Seeded Canvas 2D renderer", latencyMs, decisionCount = ART_DECISION_COUNT, appliedDecisionCount = ART_DECISION_COUNT, skippedDecisionCount = 0, omittedCount = 0, averageConfidence = null, highlights = defaultHighlights(getArtSpec()) } = {}) {
    trace.dataset.status = "complete";
    trace.dataset.source = "jev-art";
    traceSource.textContent = source;
    traceMeta.textContent = latencyMs == null ? model : `${model} · ${latencyMs} ms · ${decisionCount} asked`;
    traceVerdict.textContent = `${appliedDecisionCount} applied`;
    traceAverage.textContent = skippedDecisionCount + omittedCount > 0
      ? `${skippedDecisionCount + omittedCount} omitted`
      : Number.isFinite(averageConfidence) ? `${Math.round(averageConfidence * 100)}% avg` : "—";
    for (const dimension of DIMENSIONS) {
      const row = traceRows.get(dimension);
      const decision = highlights[dimension];
      const percent = Number.isFinite(decision?.confidence) ? Math.round(decision.confidence * 100) : null;
      row.querySelector("[data-trace-choice]").textContent = decision?.choice ?? "—";
      row.querySelector("[data-trace-confidence]").textContent = percent == null ? "—" : `${percent}%`;
      row.querySelector("[data-trace-meter]").style.setProperty("--confidence", percent == null ? "0%" : `${percent}%`);
    }
  }

  function renderPending() {
    trace.dataset.status = "pending";
    trace.dataset.source = "jev-art";
    traceSource.textContent = "Jev is composing";
    traceMeta.textContent = `Visual thesis → up to ${MAX_DECISION_COUNT} typed decisions`;
    traceVerdict.textContent = "Thesis…";
    traceAverage.textContent = "—";
  }

  function renderHistory(history) {
    const totals = getSessionTotals(history);
    const costPrefix = totals.pricedCalls > 0 && totals.pricedCalls < totals.calls ? "≥ " : "";
    const cost = totals.pricedCalls > 0 ? `${costPrefix}$${totals.costUsd.toFixed(6)}` : "cost —";
    const tokens = totals.tokenizedCalls > 0 ? `${totals.tokens.toLocaleString()} tokens` : "tokens —";
    ledgerTotal.textContent = `${totals.calls} ${totals.calls === 1 ? "call" : "calls"} · ${tokens} · ${cost}`;
    ledgerEmpty.hidden = history.length > 0;
    resetButton.disabled = history.length === 0;
    ledgerList.replaceChildren();
    history.slice(-3).reverse().forEach((entry) => {
      const item = document.createElement("li");
      const heading = document.createElement("div");
      heading.className = "ledger-entry-heading";
      const prompt = document.createElement("span");
      prompt.textContent = `“${entry.prompt}”`;
      prompt.title = entry.prompt;
      const outcome = document.createElement("strong");
      outcome.textContent = entry.outcome;
      heading.append(prompt, outcome);
      const steps = document.createElement("ul");
      steps.className = "ledger-steps";
      entry.steps.forEach((step) => {
        const row = document.createElement("li");
        const stage = document.createElement("span");
        stage.textContent = step.stage === "thesis" ? "Jev thesis" : "Jev details";
        stage.title = step.model;
        const metrics = document.createElement("span");
        metrics.textContent = `${step.latencyMs} ms · ${formatTokens(step.tokens?.total)} · ${formatCost(step.costUsd)}`;
        row.append(stage, metrics);
        steps.append(row);
      });
      item.append(heading, steps);
      ledgerList.append(item);
    });
  }

  function setPending(pending) {
    promptInput.disabled = pending;
    submitButton.disabled = pending;
    submitButton.textContent = pending ? "Composing…" : "Compose";
  }

  async function compose(prompt) {
    setPending(true);
    promptMessage.textContent = "Jev is establishing a visual thesis, then asking only relevant questions…";
    promptMessage.dataset.tone = "pending";
    renderPending();
    try {
      const result = await requestArtComposition(prompt);
      updateArtSpec(result.spec);
      renderTrace({ source: "Jev · confidence-aware", model: result.model, latencyMs: result.latencyMs, decisionCount: result.decisionCount, appliedDecisionCount: result.appliedDecisionCount, skippedDecisionCount: result.skippedDecisionCount, omittedCount: result.omitted.length, averageConfidence: result.averageConfidence, highlights: result.highlights });
      recordSessionRequest({ prompt, outcome: `${result.appliedDecisionCount} applied`, steps: result.receipts });
      const average = Number.isFinite(result.averageConfidence) ? ` · ${Math.round(result.averageConfidence * 100)}% average confidence` : "";
      const restrained = result.skippedDecisionCount + result.omitted.length;
      const repaired = result.repairs.length ? ` · ${result.repairs.length} compatibility ${result.repairs.length === 1 ? "repair" : "repairs"}` : "";
      promptMessage.textContent = `${result.appliedDecisionCount} applied · ${restrained} irrelevant or uncertain omitted · ${result.latencyMs} ms${average}${repaired}.`;
      promptMessage.dataset.tone = "success";
    } catch (error) {
      trace.dataset.status = "error";
      trace.dataset.source = "error";
      traceSource.textContent = "Composition unavailable";
      traceMeta.textContent = "Artwork unchanged";
      promptMessage.textContent = error.code === "MISSING_AI_GATEWAY_AUTH" ? "Add AI_GATEWAY_API_KEY to compose with Jev." : `Jev could not compose this piece: ${error.message}`;
      promptMessage.dataset.tone = "error";
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) {
      promptInput.setAttribute("aria-invalid", "true");
      promptMessage.textContent = "Describe an artwork before composing.";
      promptMessage.dataset.tone = "error";
      promptInput.focus();
      return;
    }
    promptInput.removeAttribute("aria-invalid");
    compose(prompt);
  }

  function onExample(event) {
    const button = event.target.closest("[data-example-prompt]");
    if (!button) return;
    promptInput.value = button.dataset.examplePrompt;
    promptInput.focus();
  }

  function onReset() {
    clearSessionHistory();
    const spec = resetArtSpec();
    renderTrace({ highlights: defaultHighlights(spec) });
    promptMessage.textContent = "Session receipt cleared and the default composition restored.";
    promptMessage.dataset.tone = "success";
  }

  promptForm.addEventListener("submit", onSubmit);
  examples.addEventListener("click", onExample);
  resetButton.addEventListener("click", onReset);
  const unsubscribeSpec = subscribeToArtSpec(renderSpec);
  const unsubscribeHistory = subscribeToSessionHistory(renderHistory);
  renderSpec(getArtSpec());
  renderTrace();
  renderHistory(getSessionHistory());
  return () => {
    promptForm.removeEventListener("submit", onSubmit);
    examples.removeEventListener("click", onExample);
    resetButton.removeEventListener("click", onReset);
    unsubscribeSpec();
    unsubscribeHistory();
  };
}
