import { getArtSpec, resetArtSpec, subscribeToArtSpec, updateArtSpec } from "./art-spec-state.js";
import { requestArtComposition } from "./composition-client.js";
import { clearSessionHistory, getRequestTotals, getSessionHistory, getSessionTotals, recordSessionRequest, subscribeToSessionHistory } from "./session-history.js";
import { ART_DECISION_COUNT } from "../shared/art-grammar.js";
import { COMPARISON_MODELS, DEFAULT_COMPARISON_MODEL, comparisonModelLabel } from "../shared/comparison-models.js";

const DIMENSIONS = ["composition", "palette", "marks", "space", "motion"];
const MAX_DECISION_COUNT = ART_DECISION_COUNT + 17;
const titleCase = (value) => String(value).toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const formatCost = (value) => Number.isFinite(value) ? `$${value.toFixed(6)}` : "cost —";
const formatTokens = (value) => Number.isFinite(value) ? `${value.toLocaleString()} tok` : "tokens —";
const formatDuration = (value) => Number.isFinite(value) ? (value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value} ms`) : "time —";
const activePalette = (spec) => spec.fieldTreatment === "MARKS"
  ? `${spec.primaryColor} · ${spec.secondaryColor} · ${spec.accentColor}`
  : `${spec.gradientStartColor} → ${spec.gradientEndColor}`;
function defaultHighlights(spec) {
  return {
    composition: { choice: spec.composition, confidence: null },
    palette: { choice: activePalette(spec), confidence: null },
    marks: { choice: spec.layers[2].primitive, confidence: null },
    space: { choice: spec.negativeSpace, confidence: null },
    motion: { choice: spec.motion, confidence: null },
  };
}

export function mountComposer({ promptForm, promptInput, promptMessage, status, trace, sessionLedger, examples }) {
  const submitButton = promptForm.querySelector("button[type='submit']");
  const compositionModeButtons = [...document.querySelectorAll("[data-composition-mode]")];
  const modelPicker = document.querySelector("[data-model-picker]");
  const comparisonModel = document.querySelector("#comparison-model");
  const canvasRoot = document.querySelector("#canvas-root");
  const sandboxPreview = document.querySelector("#sandbox-preview");
  const traceSource = trace.querySelector("[data-trace-source]");
  const traceMeta = trace.querySelector("[data-trace-meta]");
  const traceVerdict = trace.querySelector("[data-trace-verdict]");
  const traceAverage = trace.querySelector("[data-trace-average]");
  const traceSummaryLabel = trace.querySelector(".trace-summary > span:first-child");
  const artSpecCode = trace.querySelector("[data-art-spec]");
  const artSpecSummary = trace.querySelector(".art-spec-details summary");
  const traceRows = new Map([...trace.querySelectorAll("[data-trace-dimension]")].map((row) => [row.dataset.traceDimension, row]));
  const ledgerTotal = sessionLedger.querySelector("[data-ledger-total]");
  const ledgerEmpty = sessionLedger.querySelector("[data-ledger-empty]");
  const ledgerList = sessionLedger.querySelector("[data-ledger-list]");
  const resetButton = sessionLedger.querySelector("[data-reset-session]");
  let compositionMode = "jev";
  let lastSandboxPreview = "";

  comparisonModel.replaceChildren(...COMPARISON_MODELS.map((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    return option;
  }));
  comparisonModel.value = DEFAULT_COMPARISON_MODEL;

  function renderSpec(spec) {
    status.textContent = `${titleCase(spec.composition)} · ${activePalette(spec).toLowerCase()} · ${spec.atmosphere.toLowerCase()}`;
    artSpecCode.textContent = JSON.stringify(spec, null, 2);
  }

  function renderTrace({ source = "", model = "", latencyMs, decisionCount = ART_DECISION_COUNT, appliedDecisionCount = ART_DECISION_COUNT, skippedDecisionCount = 0, omittedCount = 0, averageConfidence = null, highlights = defaultHighlights(getArtSpec()) } = {}) {
    trace.dataset.status = "complete";
    trace.dataset.source = source.toLowerCase().includes("model") ? "model-art" : "jev-art";
    traceSummaryLabel.textContent = "Decision surface";
    artSpecSummary.textContent = "View applied art spec";
    traceSource.textContent = source;
    traceMeta.textContent = latencyMs == null ? model : `${model} · ${latencyMs} ms · ${decisionCount} asked`;
    traceVerdict.textContent = `${appliedDecisionCount} applied`;
    traceAverage.textContent = source.toLowerCase().includes("model")
      ? ""
      : skippedDecisionCount + omittedCount > 0
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

  function renderPending(mode) {
    trace.dataset.status = "pending";
    trace.dataset.source = mode === "model" ? "model-art" : mode === "code" ? "sandbox-code" : "jev-art";
    traceSource.textContent = mode === "model"
      ? `${comparisonModelLabel(comparisonModel.value)} is composing`
      : mode === "code"
        ? "Building isolated artwork"
        : "Jev is composing";
    traceMeta.textContent = mode === "model"
      ? `${ART_DECISION_COUNT} fields → one structured object`
      : mode === "code"
        ? "Model → JavaScript → Vercel Sandbox"
        : `Visual thesis → up to ${MAX_DECISION_COUNT} typed decisions`;
    traceVerdict.textContent = mode === "model" ? "Generating…" : mode === "code" ? "Generating…" : "Thesis…";
    traceAverage.textContent = "—";
  }

  function renderCodeTrace(result) {
    trace.dataset.status = "complete";
    trace.dataset.source = "sandbox-code";
    traceSummaryLabel.textContent = "Execution path";
    artSpecSummary.textContent = "View generated JavaScript";
    traceSource.textContent = "Code + Sandbox";
    traceMeta.textContent = `${result.model} · ${result.latencyMs} ms`;
    traceVerdict.textContent = "Preview live";
    traceAverage.textContent = `${result.trace.checks.length} checks`;
    artSpecCode.textContent = result.code;
  }

  function renderHistory(history) {
    const totals = getSessionTotals(history);
    const costPrefix = totals.pricedCalls > 0 && totals.pricedCalls < totals.calls ? "≥ " : "";
    const cost = totals.pricedCalls > 0 ? `${costPrefix}$${totals.costUsd.toFixed(6)}` : "cost —";
    const tokens = totals.tokenizedCalls > 0 ? `${totals.tokens.toLocaleString()} tokens` : "tokens —";
    ledgerTotal.textContent = `${totals.calls} ${totals.calls === 1 ? "call" : "calls"} · ${formatDuration(totals.latencyMs)} · ${tokens} · ${cost}`;
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
      outcome.textContent = entry.source === "sandbox-code"
        ? "Code + Sandbox"
        : entry.source === "model-art" || entry.source === "model"
          ? comparisonModelLabel(entry.model)
          : "Jev";
      heading.append(prompt, outcome);
      const requestTotals = getRequestTotals(entry);
      const requestSummary = document.createElement("div");
      requestSummary.className = "ledger-entry-summary";
      const requestOutcome = document.createElement("span");
      requestOutcome.textContent = `${entry.outcome} · ${requestTotals.calls} ${requestTotals.calls === 1 ? "call" : "calls"}`;
      const requestMetrics = document.createElement("span");
      requestMetrics.textContent = `${formatDuration(requestTotals.latencyMs)} · ${formatCost(requestTotals.costUsd)}`;
      requestSummary.append(requestOutcome, requestMetrics);
      const steps = document.createElement("ul");
      steps.className = "ledger-steps";
      entry.steps.forEach((step) => {
        const row = document.createElement("li");
        const stage = document.createElement("span");
        stage.textContent = step.stage === "model-code"
          ? `${comparisonModelLabel(step.model)} · JavaScript`
          : step.stage === "sandbox-execution"
            ? "Vercel Sandbox · validation"
            : step.stage === "thesis"
          ? "Jev thesis"
          : step.stage === "thesis-refinement"
            ? "Jev clarification"
            : step.stage === "model-composition" ? `${comparisonModelLabel(step.model)} · one-shot` : "Jev details";
        stage.title = step.model;
        const metrics = document.createElement("span");
        metrics.textContent = `${step.latencyMs} ms · ${formatTokens(step.tokens?.total)} · ${formatCost(step.costUsd)}`;
        row.append(stage, metrics);
        steps.append(row);
      });
      item.append(heading, requestSummary, steps);
      ledgerList.append(item);
    });
  }

  function setPending(pending) {
    promptInput.disabled = pending;
    submitButton.disabled = pending;
    compositionModeButtons.forEach((button) => { button.disabled = pending; });
    comparisonModel.disabled = pending;
    submitButton.textContent = pending ? "Composing…" : "Compose";
  }

  function setCompositionMode(mode) {
    compositionMode = mode;
    compositionModeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.compositionMode === mode)));
    modelPicker.dataset.active = String(mode === "model");
    const showSandbox = mode === "code" && Boolean(lastSandboxPreview);
    sandboxPreview.hidden = !showSandbox;
    canvasRoot.hidden = showSandbox;
    if (!showSandbox) renderSpec(getArtSpec());
  }

  async function compose(prompt) {
    const requestedMode = compositionMode;
    setPending(true);
    promptMessage.textContent = requestedMode === "model"
      ? "The comparison model is generating all 80 renderer decisions in one structured response…"
      : requestedMode === "code"
        ? "The model is writing Canvas JavaScript, then Vercel Sandbox will validate and run it…"
        : "Jev is establishing a visual thesis, then asking only relevant questions…";
    promptMessage.dataset.tone = "pending";
    renderPending(requestedMode);
    try {
      const result = await requestArtComposition(prompt, {
        mode: requestedMode,
        model: requestedMode === "model" || requestedMode === "code" ? comparisonModel.value : undefined,
      });
      if (result.mode === "code") {
        lastSandboxPreview = result.previewUrl;
        sandboxPreview.src = result.previewUrl;
        sandboxPreview.hidden = false;
        canvasRoot.hidden = true;
        status.textContent = `${result.title} · isolated sandbox preview`;
      } else {
        updateArtSpec(result.spec);
        sandboxPreview.hidden = true;
        canvasRoot.hidden = false;
      }
      if (result.mode === "code") {
        renderCodeTrace(result);
      } else {
        const source = result.mode === "model" ? "One-shot model · 80 fields" : "Jev";
        renderTrace({ source, model: result.model, latencyMs: result.latencyMs, decisionCount: result.decisionCount, appliedDecisionCount: result.appliedDecisionCount, skippedDecisionCount: result.skippedDecisionCount, omittedCount: result.omitted.length, averageConfidence: result.averageConfidence, highlights: result.highlights });
      }
      recordSessionRequest({
        prompt,
        outcome: result.mode === "code" ? "preview live" : `${result.appliedDecisionCount} applied`,
        steps: result.receipts,
        source: result.source,
        model: result.model,
      });
      if (result.mode === "code") {
        promptMessage.textContent = `${result.title} is live in Vercel Sandbox · ${result.latencyMs} ms total · expires in ${Math.round(result.expiresInMs / 60_000)} min.`;
      } else {
        const average = Number.isFinite(result.averageConfidence) ? ` · ${Math.round(result.averageConfidence * 100)}% average confidence` : "";
        const restrained = result.skippedDecisionCount + result.omitted.length;
        const repaired = result.repairs.length ? ` · ${result.repairs.length} compatibility ${result.repairs.length === 1 ? "repair" : "repairs"}` : "";
        promptMessage.textContent = result.mode === "model"
          ? `${result.appliedDecisionCount} generated in one call · ${result.latencyMs} ms${repaired}.`
          : `${result.appliedDecisionCount} applied · ${restrained} irrelevant or uncertain omitted · ${result.latencyMs} ms${average}${repaired}.`;
      }
      promptMessage.dataset.tone = "success";
    } catch (error) {
      trace.dataset.status = "error";
      trace.dataset.source = "error";
      traceSource.textContent = "Composition unavailable";
      traceMeta.textContent = "Artwork unchanged";
      promptMessage.textContent = error.code === "MISSING_AI_GATEWAY_AUTH"
        ? "Add AI_GATEWAY_API_KEY to compose through AI Gateway."
        : error.code === "MISSING_SANDBOX_AUTH"
          ? "Link this project to Vercel and pull its environment to enable Sandbox previews."
          : `${requestedMode === "model" ? "The comparison model" : requestedMode === "code" ? "Code + Sandbox" : "Jev"} could not compose this piece: ${error.message}`;
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

  function onCompositionMode(event) {
    const button = event.target.closest("[data-composition-mode]");
    if (!button || button.disabled) return;
    setCompositionMode(button.dataset.compositionMode);
  }

  function onComparisonModelActivate() {
    if (!comparisonModel.disabled) setCompositionMode("model");
  }

  function onReset() {
    clearSessionHistory();
    const spec = resetArtSpec();
    lastSandboxPreview = "";
    sandboxPreview.removeAttribute("src");
    sandboxPreview.hidden = true;
    canvasRoot.hidden = false;
    renderTrace({ highlights: defaultHighlights(spec) });
    promptMessage.textContent = "Session receipt cleared and the default composition restored.";
    promptMessage.dataset.tone = "success";
  }

  promptForm.addEventListener("submit", onSubmit);
  compositionModeButtons.forEach((button) => button.addEventListener("click", onCompositionMode));
  comparisonModel.addEventListener("focus", onComparisonModelActivate);
  comparisonModel.addEventListener("change", onComparisonModelActivate);
  examples.addEventListener("click", onExample);
  resetButton.addEventListener("click", onReset);
  const unsubscribeSpec = subscribeToArtSpec(renderSpec);
  const unsubscribeHistory = subscribeToSessionHistory(renderHistory);
  renderSpec(getArtSpec());
  setCompositionMode("jev");
  renderTrace();
  renderHistory(getSessionHistory());
  return () => {
    promptForm.removeEventListener("submit", onSubmit);
    compositionModeButtons.forEach((button) => button.removeEventListener("click", onCompositionMode));
    comparisonModel.removeEventListener("focus", onComparisonModelActivate);
    comparisonModel.removeEventListener("change", onComparisonModelActivate);
    examples.removeEventListener("click", onExample);
    resetButton.removeEventListener("click", onReset);
    unsubscribeSpec();
    unsubscribeHistory();
  };
}
