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
const DEBUG_CONFIDENCE_THRESHOLD = 0.6;

function debugLabel(value) {
  return String(value).replace(/^layer(\d+)_/, "Layer $1 · ").replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function debugValue(value) {
  if (typeof value === "boolean") return value ? "YES" : "NO";
  if (typeof value === "number") return value.toFixed(2);
  return value == null ? "—" : String(value);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function probabilitySummary(probabilities) {
  return Object.entries(probabilities ?? {})
    .filter(([, probability]) => Number.isFinite(probability))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, probability]) => `${debugLabel(label)} ${Math.round(probability * 100)}%`)
    .join(" · ");
}

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
  const promptHint = document.querySelector(".prompt-hint");
  const compositionModeButtons = [...document.querySelectorAll("[data-composition-mode]")];
  const modelPicker = document.querySelector("[data-model-picker]");
  const comparisonModel = document.querySelector("#comparison-model");
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
  const debuggerToggle = trace.querySelector("[data-debugger-toggle]");
  const debuggerToggleMeta = trace.querySelector("[data-debugger-trigger-meta]");
  const debuggerPanel = document.querySelector("[data-debugger-stages]")?.closest(".decision-debugger");
  const debuggerClose = debuggerPanel?.querySelector("[data-debugger-close]");
  const debuggerTitle = debuggerPanel?.querySelector("[data-debugger-title]");
  const debuggerSummary = debuggerPanel?.querySelector("[data-debugger-summary]");
  const debuggerStages = debuggerPanel?.querySelector("[data-debugger-stages]");
  const debuggerFilters = debuggerPanel ? [...debuggerPanel.querySelectorAll("[data-debug-filter]")] : [];
  let debuggerResult = null;
  let debuggerPrompt = "";
  let debuggerFilter = "exceptions";
  let compositionMode = "jev";

  comparisonModel.replaceChildren(...COMPARISON_MODELS.map((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    return option;
  }));
  comparisonModel.value = DEFAULT_COMPARISON_MODEL;

  function decisionRow(decision) {
    const row = element("div", "debugger-decision");
    const heading = element("div", "debugger-decision-heading");
    const name = element("span", "debugger-decision-name", debugLabel(decision.id));
    const answer = element("strong", "debugger-decision-answer", debugValue(decision.selected));
    const confidence = Number.isFinite(decision.confidence)
      ? element("span", "debugger-decision-confidence", `${Math.round(decision.confidence * 100)}%`)
      : element("span", "debugger-decision-confidence", "—");
    heading.append(name, answer, confidence);
    row.append(heading);
    if (decision.instructions) row.append(element("p", "debugger-instructions", decision.instructions));
    const probabilities = probabilitySummary(decision.probabilities);
    if (probabilities) row.append(element("p", "debugger-probabilities", probabilities));
    return row;
  }

  function stage(title, meta, content, { open = false } = {}) {
    const details = element("details", "debugger-stage");
    details.open = open;
    const summary = element("summary", "debugger-stage-summary");
    const label = element("span", null, title);
    const count = element("span", null, meta);
    summary.append(label, count);
    const body = element("div", "debugger-stage-body");
    body.append(content);
    details.append(summary, body);
    return details;
  }

  function decisionStage(title, decisions, filter, options = {}) {
    const visible = filter === "all"
      ? decisions
      : decisions.filter((decision) => !Number.isFinite(decision.confidence) || decision.confidence < DEBUG_CONFIDENCE_THRESHOLD);
    const body = element("div", "debugger-decision-list");
    if (visible.length) visible.forEach((decision) => body.append(decisionRow(decision)));
    else body.append(element("p", "debugger-empty", `No decisions below ${Math.round(DEBUG_CONFIDENCE_THRESHOLD * 100)}% confidence.`));
    const meta = filter === "all" ? `${decisions.length} decisions` : `${visible.length} exceptions`;
    return stage(title, meta, body, options);
  }

  function renderDebugger() {
    if (!debuggerResult?.trace || !debuggerPanel) return;
    const { trace: debugTrace, spec } = debuggerResult;
    debuggerTitle.textContent = `“${debuggerPrompt}”`;
    debuggerSummary.replaceChildren();
    debuggerPanel.dataset.mode = debugTrace.mode ?? "jev";

    if (debugTrace.mode === "model-only") {
      [`${debugTrace.decisionCount} generated`, "1 structured call", `${debugTrace.repairs.length} repaired`]
        .forEach((text) => debuggerSummary.append(element("span", null, text)));
      debuggerStages.replaceChildren();

      const promptBody = element("div", "debugger-constraint-list");
      promptBody.append(element("p", "debugger-handoff", debuggerPrompt));
      debuggerStages.append(stage("01 · User prompt", "direct", promptBody));

      const specBody = element("pre", "debugger-spec");
      specBody.append(element("code", null, JSON.stringify(spec, null, 2)));
      debuggerStages.append(stage("02 · Complete model output", `${debugTrace.decisionCount} fields`, specBody, { open: true }));

      const repairBody = element("div", "debugger-compile-list");
      if (debugTrace.repairs.length) {
        debugTrace.repairs.forEach((repair) => repairBody.append(element("p", "debugger-compile-item", repair)));
      } else {
        repairBody.append(element("p", "debugger-empty", "No compatibility repairs."));
      }
      debuggerStages.append(stage("03 · Shared compatibility pass", `${debugTrace.repairs.length} repairs`, repairBody));
      return;
    }

    const summaryItems = [
      `${debugTrace.tier1.decisions.length} thesis`,
      ...(debugTrace.tier1.refinement ? [`${debugTrace.tier1.refinement.questionIds.length} clarified`] : []),
      `${debugTrace.tier2.decisions.length} detailed`,
      `${debugTrace.compile.omittedQuestionIds.length} uncertain`,
      `${debugTrace.compile.repairs.length} repaired`,
    ];
    summaryItems.forEach((text) => debuggerSummary.append(element("span", null, text)));
    debuggerStages.replaceChildren();

    const constraintBody = element("div", "debugger-constraint-list");
    const colors = debugTrace.constraints.colors ?? [];
    constraintBody.append(element("p", "debugger-handoff", colors.length ? `Named colors → ${colors.join(" · ")}` : "No literal colors extracted."));
    debuggerStages.append(stage("01 · Literal constraints", `${colors.length} colors`, constraintBody));

    debuggerStages.append(decisionStage("02 · Tier 1 thesis", debugTrace.tier1.decisions, debuggerFilter));

    if (debugTrace.tier1.refinement) {
      const accepted = debugTrace.tier1.refinement.acceptedQuestionIds.length;
      debuggerStages.append(decisionStage(
        "02B · Confidence clarification",
        debugTrace.tier1.refinement.decisions,
        "all",
        { open: true },
      ));
      const clarificationStage = debuggerStages.lastElementChild;
      clarificationStage.querySelector(".debugger-stage-summary span:last-child").textContent = `${accepted} improved · threshold ${Math.round(debugTrace.tier1.refinement.threshold * 100)}%`;
    }

    const routingBody = element("div", "debugger-routing");
    const handoff = element("div", "debugger-handoff-grid");
    for (const [key, value] of Object.entries(debugTrace.tier1.handoff)) {
      if (key === "relevance") continue;
      const item = element("div", "debugger-handoff-item");
      item.append(element("span", null, debugLabel(key)), element("strong", null, debugValue(value)));
      handoff.append(item);
    }
    routingBody.append(handoff);
    const familyList = element("div", "debugger-family-list");
    debugTrace.routing.families.forEach((family) => {
      const item = element("div", `debugger-family ${family.routed ? "is-routed" : "is-skipped"}`);
      item.append(
        element("span", "debugger-family-name", debugLabel(family.family)),
        element("strong", null, family.score.toFixed(2)),
        element("span", null, family.routed ? "ASK" : "SKIP"),
      );
      familyList.append(item);
    });
    routingBody.append(familyList);
    const routeMeta = `${debugTrace.routing.askedQuestionIds.length} asked · ${debugTrace.routing.skippedQuestionIds.length} skipped · threshold ${debugTrace.routing.threshold}`;
    debuggerStages.append(stage("03 · Routing handoff", routeMeta, routingBody, { open: true }));

    debuggerStages.append(decisionStage("04 · Tier 2 details", debugTrace.tier2.decisions, debuggerFilter));

    const compileBody = element("div", "debugger-compile-list");
    const overrides = debugTrace.compile.overrides ?? [];
    if (overrides.length) {
      overrides.forEach((override) => compileBody.append(element("p", "debugger-compile-item", override)));
    } else {
      compileBody.append(element("p", "debugger-empty", "No overrides or repairs."));
    }
    if (debugTrace.compile.omittedQuestionIds.length) {
      compileBody.append(element("p", "debugger-compile-meta", `Uncertain → ${debugTrace.compile.omittedQuestionIds.map(debugLabel).join(" · ")}`));
    }
    if (debuggerFilter === "all" && debugTrace.compile.defaultedQuestionIds.length) {
      compileBody.append(element("p", "debugger-compile-meta", `Defaulted → ${debugTrace.compile.defaultedQuestionIds.map(debugLabel).join(" · ")}`));
    }
    debuggerStages.append(stage("05 · Compile", `${overrides.length} overrides`, compileBody, { open: true }));

    const specBody = element("pre", "debugger-spec");
    specBody.append(element("code", null, JSON.stringify(spec, null, 2)));
    debuggerStages.append(stage("06 · Final ArtSpec", `${spec.layers.length} layers`, specBody));
  }

  function openDebugger() {
    if (!debuggerResult || !debuggerPanel) return;
    debuggerPanel.hidden = false;
    debuggerToggle.setAttribute("aria-expanded", "true");
    debuggerClose.focus();
  }

  function closeDebugger() {
    if (!debuggerPanel) return;
    debuggerPanel.hidden = true;
    debuggerToggle.setAttribute("aria-expanded", "false");
    debuggerToggle.focus();
  }

  function onDebuggerFilter(event) {
    const button = event.target.closest("[data-debug-filter]");
    if (!button) return;
    debuggerFilter = button.dataset.debugFilter;
    debuggerFilters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    renderDebugger();
  }

  function onDebuggerKeydown(event) {
    if (event.key === "Escape" && debuggerPanel && !debuggerPanel.hidden) closeDebugger();
  }

  function renderSpec(spec) {
    status.textContent = `${titleCase(spec.composition)} · ${activePalette(spec).toLowerCase()} · ${spec.atmosphere.toLowerCase()}`;
    artSpecCode.textContent = JSON.stringify(spec, null, 2);
  }

  function renderTrace({ source = "Fixed art grammar", model = "Seeded Canvas 2D renderer", latencyMs, decisionCount = ART_DECISION_COUNT, appliedDecisionCount = ART_DECISION_COUNT, skippedDecisionCount = 0, omittedCount = 0, averageConfidence = null, highlights = defaultHighlights(getArtSpec()) } = {}) {
    trace.dataset.status = "complete";
    trace.dataset.source = source.toLowerCase().includes("model") ? "model-art" : "jev-art";
    traceSource.textContent = source;
    traceMeta.textContent = latencyMs == null ? model : `${model} · ${latencyMs} ms · ${decisionCount} asked`;
    traceVerdict.textContent = `${appliedDecisionCount} applied`;
    traceAverage.textContent = source.toLowerCase().includes("model")
      ? "no confidence"
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
    trace.dataset.source = mode === "model" ? "model-art" : "jev-art";
    traceSource.textContent = mode === "model" ? "Other model is composing" : "Jev is composing";
    traceMeta.textContent = mode === "model"
      ? `${ART_DECISION_COUNT} fields → one structured object`
      : `Visual thesis → up to ${MAX_DECISION_COUNT} typed decisions`;
    traceVerdict.textContent = mode === "model" ? "Generating…" : "Thesis…";
    traceAverage.textContent = "—";
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
      outcome.textContent = entry.source === "model-art" || entry.source === "model"
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
        stage.textContent = step.stage === "thesis"
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
    promptHint.textContent = mode === "model" ? "One model call · all 80 fields" : "Jev · relevant decisions only";
  }

  async function compose(prompt) {
    const requestedMode = compositionMode;
    setPending(true);
    promptMessage.textContent = requestedMode === "model"
      ? "The comparison model is generating all 80 renderer decisions in one structured response…"
      : "Jev is establishing a visual thesis, then asking only relevant questions…";
    promptMessage.dataset.tone = "pending";
    renderPending(requestedMode);
    try {
      const result = await requestArtComposition(prompt, {
        mode: requestedMode,
        model: requestedMode === "model" ? comparisonModel.value : undefined,
      });
      updateArtSpec(result.spec);
      debuggerResult = result;
      debuggerPrompt = prompt;
      debuggerToggle.disabled = !result.trace;
      debuggerToggleMeta.textContent = result.trace?.mode === "model-only"
        ? `1 → ${result.decisionCount}`
        : result.trace ? `${result.trace.tier1.decisions.length} → ${result.trace.tier2.decisions.length}` : "Trace unavailable";
      renderDebugger();
      const source = result.mode === "model" ? "One-shot model · 80 fields" : "Jev · confidence-aware";
      renderTrace({ source, model: result.model, latencyMs: result.latencyMs, decisionCount: result.decisionCount, appliedDecisionCount: result.appliedDecisionCount, skippedDecisionCount: result.skippedDecisionCount, omittedCount: result.omitted.length, averageConfidence: result.averageConfidence, highlights: result.highlights });
      recordSessionRequest({
        prompt,
        outcome: `${result.appliedDecisionCount} applied`,
        steps: result.receipts,
        source: result.source,
        model: result.model,
      });
      const average = Number.isFinite(result.averageConfidence) ? ` · ${Math.round(result.averageConfidence * 100)}% average confidence` : "";
      const restrained = result.skippedDecisionCount + result.omitted.length;
      const repaired = result.repairs.length ? ` · ${result.repairs.length} compatibility ${result.repairs.length === 1 ? "repair" : "repairs"}` : "";
      promptMessage.textContent = result.mode === "model"
        ? `${result.appliedDecisionCount} generated in one call · ${result.latencyMs} ms${repaired}.`
        : `${result.appliedDecisionCount} applied · ${restrained} irrelevant or uncertain omitted · ${result.latencyMs} ms${average}${repaired}.`;
      promptMessage.dataset.tone = "success";
    } catch (error) {
      trace.dataset.status = "error";
      trace.dataset.source = "error";
      traceSource.textContent = "Composition unavailable";
      traceMeta.textContent = "Artwork unchanged";
      promptMessage.textContent = error.code === "MISSING_AI_GATEWAY_AUTH"
        ? "Add AI_GATEWAY_API_KEY to compose through AI Gateway."
        : `${requestedMode === "model" ? "The comparison model" : "Jev"} could not compose this piece: ${error.message}`;
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
    renderTrace({ highlights: defaultHighlights(spec) });
    promptMessage.textContent = "Session receipt cleared and the default composition restored.";
    promptMessage.dataset.tone = "success";
    debuggerResult = null;
    debuggerPrompt = "";
    debuggerToggle.disabled = true;
    debuggerToggleMeta.textContent = "Run a prompt";
    if (debuggerPanel) debuggerPanel.hidden = true;
  }

  promptForm.addEventListener("submit", onSubmit);
  compositionModeButtons.forEach((button) => button.addEventListener("click", onCompositionMode));
  comparisonModel.addEventListener("focus", onComparisonModelActivate);
  comparisonModel.addEventListener("change", onComparisonModelActivate);
  examples.addEventListener("click", onExample);
  resetButton.addEventListener("click", onReset);
  debuggerToggle.addEventListener("click", openDebugger);
  debuggerClose?.addEventListener("click", closeDebugger);
  debuggerPanel?.addEventListener("click", onDebuggerFilter);
  document.addEventListener("keydown", onDebuggerKeydown);
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
    debuggerToggle.removeEventListener("click", openDebugger);
    debuggerClose?.removeEventListener("click", closeDebugger);
    debuggerPanel?.removeEventListener("click", onDebuggerFilter);
    document.removeEventListener("keydown", onDebuggerKeydown);
    unsubscribeSpec();
    unsubscribeHistory();
  };
}
