import { getArtSpec, resetArtSpec, subscribeToArtSpec, updateArtSpec } from "./art-spec-state.js";
import { requestArtComposition } from "./composition-client.js";
import { clearSessionHistory, getRequestTotals, getSessionHistory, getSessionTotals, recordSessionRequest, subscribeToSessionHistory } from "./session-history.js";
import { ART_DECISION_COUNT } from "../shared/art-grammar.js";
import { COMPARISON_MODELS, comparisonModelLabel } from "../shared/comparison-models.js";
import { IMAGE_MODELS, imageModelLabel } from "../shared/image-models.js";

const DIMENSIONS = ["composition", "palette", "marks", "space", "motion"];
const MAX_DECISION_COUNT = ART_DECISION_COUNT + 16;
const titleCase = (value) => String(value).toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const decisionLabel = (value) => String(value)
  .replace(/_/g, " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
function decisionOutcome(decision) {
  const confidence = Number.isFinite(decision.confidence)
    ? `Confidence ${Math.round(decision.confidence * 100)}%`
    : "Confidence —";
  if (decision.type === "score" && Number.isFinite(decision.selected)) {
    const score = Number(decision.selected.toFixed(2));
    const maximum = Array.isArray(decision.criteria) ? decision.criteria.length - 1 : null;
    return `Score ${score}${maximum == null ? "" : ` / ${maximum}`} · ${confidence}`;
  }
  const selected = decision.selected == null ? "Applied" : decisionLabel(decision.selected);
  return `${selected} · ${confidence}`;
}
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

const traceValue = (value) => Array.isArray(value)
  ? value.length ? value.join(", ") : "none"
  : value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "—");

function createTraceList(items, className = "trace-deep-list") {
  const list = document.createElement("ul");
  list.className = className;
  list.replaceChildren(...items.map((item) => {
    const row = document.createElement("li");
    if (typeof item === "string") row.textContent = item;
    else {
      const label = document.createElement("span");
      const value = document.createElement("span");
      label.textContent = item.label;
      value.textContent = item.value;
      if (item.title) value.title = item.title;
      row.append(label, value);
    }
    return row;
  }));
  return list;
}

function createDecisionDisclosure(decision) {
  const disclosure = document.createElement("details");
  disclosure.className = "trace-deep-decision";
  const summary = document.createElement("summary");
  const name = document.createElement("span");
  const outcome = document.createElement("span");
  name.textContent = decisionLabel(decision.id);
  outcome.textContent = decisionOutcome(decision);
  summary.append(name, outcome);
  const body = document.createElement("div");
  body.className = "trace-deep-decision-body";
  if (decision.instructions) {
    const instructions = document.createElement("p");
    instructions.textContent = decision.instructions;
    body.append(instructions);
  }
  const probabilities = Object.entries(decision.probabilities ?? {});
  if (probabilities.length) {
    body.append(createTraceList(probabilities
      .sort((a, b) => b[1] - a[1])
      .map(([key, probability], index) => {
        const criterion = Array.isArray(decision.criteria)
          ? decision.criteria[Number(key)]
          : decision.criteria?.[key];
        const selected = decision.type === "score" ? index === 0 : String(decision.selected) === key;
        return {
          label: `${selected ? "→ " : ""}${decisionLabel(key)}`,
          value: `${Math.round(probability * 100)}%`,
          title: criterion,
        };
      }), "trace-probabilities"));
  }
  disclosure.append(summary, body);
  return disclosure;
}

function createTraceStep(number, title, summaryText, content = [], { open = false } = {}) {
  const item = document.createElement("li");
  item.className = "trace-step";
  const disclosure = document.createElement("details");
  disclosure.open = open;
  const summary = document.createElement("summary");
  const index = document.createElement("span");
  const heading = document.createElement("span");
  const result = document.createElement("span");
  index.textContent = String(number).padStart(2, "0");
  heading.textContent = title;
  result.textContent = summaryText;
  summary.append(index, heading, result);
  const body = document.createElement("div");
  body.className = "trace-step-body";
  body.append(...content.filter(Boolean));
  disclosure.append(summary, body);
  item.append(disclosure);
  return item;
}

export function mountComposer({ promptForm, promptInput, promptMessage, status, trace, sessionLedger, examples }) {
  const submitButton = promptForm.querySelector("button[type='submit']");
  const compositionModeButtons = [...document.querySelectorAll("[data-composition-mode]")];
  const modelPicker = document.querySelector("[data-model-picker]");
  const comparisonModel = document.querySelector("#comparison-model");
  const imageModelPicker = document.querySelector("[data-image-model-picker]");
  const imageModel = document.querySelector("#image-model");
  const canvasRoot = document.querySelector("#canvas-root");
  const sandboxPreview = document.querySelector("#sandbox-preview");
  const imagePreview = document.querySelector("#image-preview");
  const sandboxStatus = document.querySelector("[data-sandbox-status]");
  const sandboxStatusLabel = document.querySelector("[data-sandbox-status-label]");
  const traceSource = trace.querySelector("[data-trace-source]");
  const traceMeta = trace.querySelector("[data-trace-meta]");
  const traceVerdict = trace.querySelector("[data-trace-verdict]");
  const traceAverage = trace.querySelector("[data-trace-average]");
  const traceSummaryLabel = trace.querySelector(".trace-summary > span:first-child");
  const traceRouteReason = trace.querySelector("[data-trace-route-reason]");
  const artSpecCode = trace.querySelector("[data-art-spec]");
  const artSpecSummary = trace.querySelector(".art-spec-details summary");
  const traceDecisionLists = trace.querySelector("[data-trace-decision-lists]");
  const traceAppliedCount = trace.querySelector("[data-trace-applied-count]");
  const traceOmittedCount = trace.querySelector("[data-trace-omitted-count]");
  const traceAppliedList = trace.querySelector("[data-trace-applied-list]");
  const traceOmittedList = trace.querySelector("[data-trace-omitted-list]");
  const traceDeep = trace.querySelector("[data-trace-deep]");
  const traceStepCount = trace.querySelector("[data-trace-step-count]");
  const traceTimeline = trace.querySelector("[data-trace-timeline]");
  const traceRows = new Map([...trace.querySelectorAll("[data-trace-dimension]")].map((row) => [row.dataset.traceDimension, row]));
  const ledgerTotal = sessionLedger.querySelector("[data-ledger-total]");
  const ledgerEmpty = sessionLedger.querySelector("[data-ledger-empty]");
  const ledgerHelp = sessionLedger.querySelector("[data-ledger-help]");
  const ledgerList = sessionLedger.querySelector("[data-ledger-list]");
  const resetButton = sessionLedger.querySelector("[data-reset-session]");
  let compositionMode = "jev";
  let lastSandboxPreview = "";
  let lastImagePreview = "";
  let sandboxCountdownTimer = null;
  let liveRequestRunning = false;
  let queuedLivePrompt = "";
  let artMorphTimer = null;

  comparisonModel.replaceChildren(...[
    { id: "jev", label: "Jev (live, fastest)" },
    ...COMPARISON_MODELS,
  ].map((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    return option;
  }));
  comparisonModel.value = "jev";

  imageModel.replaceChildren(...IMAGE_MODELS.map((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    return option;
  }));

  function renderSpec(spec) {
    status.textContent = `composition: ${String(spec.composition).toLowerCase()} · ${activePalette(spec).toLowerCase()} · ${spec.atmosphere.toLowerCase()}`;
    artSpecCode.textContent = JSON.stringify(spec, null, 2);
  }

  function renderDecisionLists(decisionTrace) {
    if (!decisionTrace?.tier1?.decisions || !decisionTrace?.tier2?.decisions) {
      traceDecisionLists.hidden = true;
      traceAppliedList.replaceChildren();
      traceOmittedList.replaceChildren();
      return;
    }

    const uncertain = new Set(decisionTrace.compile?.omittedQuestionIds ?? []);
    const applied = [...decisionTrace.tier1.decisions, ...decisionTrace.tier2.decisions]
      .filter((decision) => !uncertain.has(decision.id));
    const omitted = [
      ...(decisionTrace.routing?.skippedQuestionIds ?? []).map((id) => ({ id, reason: "irrelevant" })),
      ...(decisionTrace.compile?.omittedQuestionIds ?? []).map((id) => ({ id, reason: "uncertain" })),
    ];

    traceAppliedList.replaceChildren(...applied.map((decision) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const outcome = document.createElement("span");
      name.textContent = decisionLabel(decision.id);
      outcome.textContent = decisionOutcome(decision);
      if (decision.type === "score" && Array.isArray(decision.criteria)) {
        outcome.title = decision.criteria.map((criterion, index) => `${index}: ${criterion}`).join(" · ");
      }
      item.append(name, outcome);
      return item;
    }));
    traceOmittedList.replaceChildren(...omitted.map(({ id, reason }) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const outcome = document.createElement("span");
      name.textContent = decisionLabel(id);
      outcome.textContent = reason;
      item.append(name, outcome);
      return item;
    }));
    traceAppliedCount.textContent = String(applied.length);
    traceOmittedCount.textContent = String(omitted.length);
    traceDecisionLists.hidden = false;
  }

  function renderDeepTrace(decisionTrace, autoRoute) {
    if (!decisionTrace?.tier1?.decisions || !decisionTrace?.tier2?.decisions) {
      traceDeep.hidden = true;
      traceDeep.open = false;
      traceTimeline.replaceChildren();
      return;
    }

    const steps = [];
    const gate = decisionTrace.gate ?? null;
    if (gate?.decisions?.length) {
      const gateSummary = gate.route === "CUSTOM_CODE" ? "Custom code" : "Populate spec";
      const gateIntro = document.createElement("p");
      gateIntro.className = "trace-step-note";
      gateIntro.textContent = `${gate.reason} Custom code requires at least ${Math.round((gate.threshold ?? 0.65) * 100)}% confidence.`;
      steps.push(createTraceStep(1, "Route check", `${gateSummary} · ${Math.round((gate.confidence ?? 0) * 100)}%`, [
        gateIntro,
        ...gate.decisions.map(createDecisionDisclosure),
      ], { open: true }));
    } else {
      const note = document.createElement("p");
      note.className = "trace-step-note";
      note.textContent = autoRoute
        ? autoRoute.reason
        : "Live Jev previews skip the custom-code route check and populate the renderer directly.";
      steps.push(createTraceStep(1, "Route check", gate ? decisionLabel(gate.route) : "Skipped for live preview", [note]));
    }

    const colors = decisionTrace.constraints?.colors ?? [];
    steps.push(createTraceStep(2, "Literal constraints", colors.length ? colors.join(" · ") : "None detected", [
      createTraceList([{ label: "Prompt colors", value: colors.length ? colors.join(", ") : "None" }]),
    ]));

    steps.push(createTraceStep(3, "Visual thesis", `${decisionTrace.tier1.decisions.length} decisions`,
      decisionTrace.tier1.decisions.map(createDecisionDisclosure)));

    const refinement = decisionTrace.tier1.refinement;
    if (refinement) {
      const accepted = new Set(refinement.acceptedQuestionIds ?? []);
      const comparisons = (refinement.decisions ?? []).map((decision) => {
        const initial = refinement.initialDecisions?.find(({ id }) => id === decision.id);
        const row = document.createElement("div");
        row.className = "trace-refinement";
        const heading = document.createElement("p");
        heading.textContent = `${decisionLabel(decision.id)} · ${accepted.has(decision.id) ? "recheck accepted" : "original retained"}`;
        row.append(heading, createTraceList([
          { label: "Initial", value: initial ? decisionOutcome(initial) : "—" },
          { label: "Recheck", value: decisionOutcome(decision) },
        ]));
        return row;
      });
      steps.push(createTraceStep(4, "Confidence refinement", `${accepted.size} improved`, comparisons));
    } else {
      const note = document.createElement("p");
      note.className = "trace-step-note";
      note.textContent = "No core thesis choice fell below the 55% confidence threshold.";
      steps.push(createTraceStep(4, "Confidence refinement", "Not needed", [note]));
    }

    const skippedByFamily = new Map();
    for (const skipped of decisionTrace.routing?.skippedQuestions ?? []) {
      const items = skippedByFamily.get(skipped.family) ?? [];
      items.push(skipped);
      skippedByFamily.set(skipped.family, items);
    }
    const skippedReasonContent = (entries) => {
      const grouped = new Map();
      for (const entry of entries) {
        const ids = grouped.get(entry.reason) ?? [];
        ids.push(entry.id);
        grouped.set(entry.reason, ids);
      }
      return [...grouped.entries()].flatMap(([reason, ids]) => {
        const note = document.createElement("p");
        note.className = "trace-step-note";
        note.textContent = reason;
        return [note, createTraceList([{ label: `${ids.length} not asked`, value: ids.map(decisionLabel).join(", ") }])];
      });
    };
    const familyRows = (decisionTrace.routing?.families ?? []).map((family) => {
      const disclosure = document.createElement("details");
      disclosure.className = "trace-family";
      const summary = document.createElement("summary");
      const label = document.createElement("span");
      const result = document.createElement("span");
      label.textContent = decisionLabel(family.family);
      result.textContent = `${Number(family.score.toFixed(2))} / 3 · ${family.routed ? "routed" : "skipped"}`;
      summary.append(label, result);
      const skipped = skippedByFamily.get(family.family) ?? [];
      const body = document.createElement("div");
      body.className = "trace-family-body";
      body.append(...(skipped.length
        ? skippedReasonContent(skipped)
        : [createTraceList([{ label: "Renderer questions", value: family.routed ? "Included" : "No direct fields remained" }])]));
      disclosure.append(summary, body);
      return disclosure;
    });
    const structuralSkips = [...skippedByFamily.entries()]
      .filter(([family]) => !decisionTrace.routing.families?.some((entry) => entry.family === family))
      .flatMap(([, entries]) => entries);
    if (structuralSkips.length) {
      const structural = document.createElement("details");
      structural.className = "trace-family";
      const summary = document.createElement("summary");
      const label = document.createElement("span");
      const count = document.createElement("span");
      label.textContent = "Structural route";
      count.textContent = `${structuralSkips.length} not asked`;
      summary.append(label, count);
      const body = document.createElement("div");
      body.className = "trace-family-body";
      body.append(...skippedReasonContent(structuralSkips));
      structural.append(summary, body);
      familyRows.unshift(structural);
    }
    steps.push(createTraceStep(5, "Characteristic routing", `${decisionTrace.routing?.askedQuestionIds?.length ?? 0} asked · ${decisionTrace.routing?.skippedQuestionIds?.length ?? 0} skipped`, familyRows));

    const decisionGroups = new Map([["Global", []], ["Foundation layer", []], ["Structure layer", []], ["Accent layer", []], ["Detail layer", []]]);
    for (const decision of decisionTrace.tier2.decisions) {
      const match = decision.id.match(/^layer([1-4])_/);
      const group = match ? [...decisionGroups.keys()][Number(match[1])] : "Global";
      decisionGroups.get(group).push(decision);
    }
    const rendererGroups = [...decisionGroups.entries()].filter(([, decisions]) => decisions.length).map(([label, decisions]) => {
      const group = document.createElement("details");
      group.className = "trace-decision-group";
      const summary = document.createElement("summary");
      const name = document.createElement("span");
      const count = document.createElement("span");
      name.textContent = label;
      count.textContent = `${decisions.length} decisions`;
      summary.append(name, count);
      const body = document.createElement("div");
      body.append(...decisions.map(createDecisionDisclosure));
      group.append(summary, body);
      return group;
    });
    steps.push(createTraceStep(6, "Renderer decisions", `${decisionTrace.tier2.decisions.length} answered`, rendererGroups));

    const compile = decisionTrace.compile ?? {};
    const compileItems = [
      ...(compile.overrides ?? []).map((value) => ({ label: "Override", value })),
      ...(compile.omittedQuestionIds ?? []).map((value) => ({ label: decisionLabel(value), value: "Safe fallback used" })),
    ];
    steps.push(createTraceStep(7, "Compilation", `${compile.overrides?.length ?? 0} transformations`, [
      createTraceList(compileItems.length ? compileItems : [{ label: "Result", value: "No overrides or repairs" }]),
    ]));

    const provenance = compile.provenance ?? [];
    const provenanceList = document.createElement("div");
    provenanceList.className = "trace-provenance";
    provenanceList.replaceChildren(...provenance.map((entry) => {
      const row = document.createElement("details");
      const summary = document.createElement("summary");
      const path = document.createElement("code");
      const value = document.createElement("span");
      const source = document.createElement("span");
      const reason = document.createElement("p");
      path.textContent = entry.path;
      value.textContent = traceValue(entry.value);
      source.textContent = decisionLabel(entry.source);
      reason.textContent = entry.reason;
      summary.append(path, value, source);
      row.append(summary, reason);
      return row;
    }));
    steps.push(createTraceStep(8, "Final renderer spec", `${provenance.length} values with provenance`, [provenanceList]));

    traceTimeline.replaceChildren(...steps);
    traceStepCount.textContent = `${steps.length} steps`;
    traceDeep.hidden = false;
  }

  function renderTrace({ source = "", model = "", latencyMs, appliedDecisionCount = ART_DECISION_COUNT, skippedDecisionCount = 0, omittedCount = 0, averageConfidence = null, highlights = defaultHighlights(getArtSpec()), decisionTrace = null, autoRoute = null } = {}) {
    const isModelComposition = source !== "Jev" && Boolean(model);
    trace.dataset.status = "complete";
    trace.dataset.source = isModelComposition ? "model-art" : "jev-art";
    traceSummaryLabel.textContent = "Decision surface";
    artSpecSummary.textContent = "View render spec";
    traceSource.textContent = autoRoute?.selected === "POPULATE_SPEC" ? "Jev · Populate spec" : source;
    traceMeta.textContent = latencyMs == null ? model : `${model} · ${latencyMs} ms`;
    traceMeta.title = latencyMs == null
      ? "Model used for this composition."
      : "Model used and end-to-end latency.";
    traceRouteReason.hidden = !autoRoute?.reason;
    traceRouteReason.textContent = autoRoute?.reason ? `Route: ${autoRoute.reason}` : "";
    traceVerdict.textContent = `${appliedDecisionCount} applied`;
    traceVerdict.title = "Characteristics accepted and applied to the renderer.";
    traceAverage.textContent = isModelComposition
      ? ""
      : skippedDecisionCount + omittedCount > 0
      ? `${skippedDecisionCount + omittedCount} omitted`
      : Number.isFinite(averageConfidence) ? `${Math.round(averageConfidence * 100)}% avg` : "—";
    traceAverage.title = isModelComposition
      ? "This route fills the complete renderer spec in one structured response."
      : skippedDecisionCount + omittedCount > 0
        ? "Questions Jev skipped because they were irrelevant to the prompt or too uncertain to apply."
        : "Average confidence across the applied Jev decisions.";
    renderDecisionLists(isModelComposition ? null : decisionTrace);
    renderDeepTrace(isModelComposition ? null : decisionTrace, autoRoute);
    for (const dimension of DIMENSIONS) {
      const row = traceRows.get(dimension);
      const decision = highlights[dimension];
      const percent = Number.isFinite(decision?.confidence) ? Math.round(decision.confidence * 100) : null;
      row.querySelector("[data-trace-choice]").textContent = decision?.choice ?? "—";
      const confidence = row.querySelector("[data-trace-confidence]");
      confidence.textContent = percent == null ? "—" : `${percent}%`;
      confidence.title = percent == null
        ? "This route does not report confidence for this decision."
        : "Jev's confidence in this routed decision.";
      row.querySelector("[data-trace-meter]").style.setProperty("--confidence", percent == null ? "0%" : `${percent}%`);
    }
  }

  function renderPending(mode) {
    traceDecisionLists.hidden = true;
    traceDeep.hidden = true;
    traceDeep.open = false;
    traceTimeline.replaceChildren();
    traceRouteReason.hidden = true;
    trace.dataset.status = "pending";
    trace.dataset.source = mode === "model" ? "model-art" : mode === "code" ? "sandbox-code" : mode === "image" ? "image-generation" : "jev-art";
    traceSource.textContent = mode === "model"
      ? `${comparisonModelLabel(comparisonModel.value)} is composing`
      : mode === "code"
        ? "Building isolated artwork"
        : mode === "image"
          ? `${imageModelLabel(imageModel.value)} is generating`
        : "Jev is checking renderer fit";
    traceMeta.textContent = mode === "model"
      ? `${ART_DECISION_COUNT} fields → one structured object`
      : mode === "code"
        ? "Model → JavaScript → Vercel Sandbox"
        : mode === "image"
          ? "Prompt → image model → pixels"
        : `Route check → visual thesis → up to ${MAX_DECISION_COUNT} typed decisions`;
    traceMeta.title = "The composition pipeline currently being evaluated.";
    traceVerdict.textContent = mode === "jev" ? "Thesis…" : "Generating…";
    traceVerdict.title = "Composition is still in progress.";
    traceAverage.textContent = "—";
    traceAverage.title = "Routing detail will appear when composition completes.";
  }

  function renderProgress(progress) {
    if (!progress) return;
    if (progress.stage === "route-check" && progress.status === "complete" && progress.route === "CUSTOM_CODE") {
      setCompositionMode("code", { preserveCanvas: true });
    }
    trace.dataset.status = "pending";
    trace.dataset.source = progress.stage === "image-generation"
      ? "image-generation"
      : progress.stage?.startsWith("sandbox") || ["code-generation", "syntax-check", "runtime-check", "preview-start", "preview-ready"].includes(progress.stage)
      ? "sandbox-code"
      : "jev-art";
    traceSource.textContent = progress.label ?? "Composing";
    traceMeta.textContent = progress.autoRouted && progress.routeReason
      ? `Rerouted: ${progress.routeReason}`
      : progress.detail ?? "";
    traceMeta.title = progress.autoRouted && progress.routeReason
      ? `Jev selected custom code because ${progress.routeReason.toLowerCase()}`
      : progress.detail ?? "Current composition step.";
    traceRouteReason.hidden = !progress.routeReason;
    traceRouteReason.textContent = progress.routeReason ? `Route: ${progress.routeReason}` : "";
    traceVerdict.textContent = progress.status === "complete" ? "Complete" : "Running…";
    traceVerdict.title = "Live execution status.";
    traceAverage.textContent = "";
    traceAverage.title = "";
    promptMessage.textContent = progress.message ?? "Composing…";
    promptMessage.title = progress.routeReason ?? progress.detail ?? "";
  }

  function renderCodeTrace(result) {
    traceDecisionLists.hidden = true;
    traceDeep.hidden = true;
    traceDeep.open = false;
    traceTimeline.replaceChildren();
    trace.dataset.status = "complete";
    trace.dataset.source = "sandbox-code";
    traceSummaryLabel.textContent = "Execution path";
    artSpecSummary.textContent = "View generated JavaScript";
    traceSource.textContent = result.autoRoute ? "Jev → Custom code + Sandbox" : "Custom code + Sandbox";
    traceMeta.textContent = `${result.model} · ${result.latencyMs} ms`;
    traceMeta.title = "Code-generation model and total end-to-end latency.";
    traceVerdict.textContent = "Preview live";
    traceVerdict.title = "The generated JavaScript passed validation and is running in an isolated preview.";
    traceAverage.textContent = `${result.trace.checks.length} checks`;
    traceAverage.title = "Validation checks completed before the preview was exposed.";
    traceRouteReason.hidden = !result.autoRoute?.reason;
    traceRouteReason.textContent = result.autoRoute?.reason ? `Route: ${result.autoRoute.reason}` : "";
    artSpecCode.textContent = result.code;
  }

  function renderImageTrace(result) {
    traceDecisionLists.hidden = true;
    traceDeep.hidden = true;
    traceDeep.open = false;
    traceTimeline.replaceChildren();
    trace.dataset.status = "complete";
    trace.dataset.source = "image-generation";
    traceSummaryLabel.textContent = "Generation path";
    traceSource.textContent = "Image generation";
    traceMeta.textContent = `${imageModelLabel(result.model)} · ${result.latencyMs} ms`;
    traceMeta.title = "Image model and total generation latency.";
    traceVerdict.textContent = "Image ready";
    traceVerdict.title = "The selected image model generated pixels directly from the prompt.";
    traceAverage.textContent = `${result.trace?.imagesGenerated ?? 1} image`;
    traceAverage.title = "Number of images generated in this request.";
    traceRouteReason.hidden = false;
    traceRouteReason.textContent = "This path bypasses the renderer spec and custom JavaScript.";
    artSpecCode.textContent = "";
  }

  function renderHistory(history) {
    const totals = getSessionTotals(history);
    const costPrefix = totals.pricedCalls > 0 && totals.pricedCalls < totals.calls ? "≥ " : "";
    const cost = totals.pricedCalls > 0 ? `${costPrefix}$${totals.costUsd.toFixed(6)}` : "cost —";
    const tokens = totals.tokenizedCalls > 0 ? `${totals.tokens.toLocaleString()} tokens` : "tokens —";
    ledgerTotal.textContent = `${totals.calls} ${totals.calls === 1 ? "call" : "calls"} · ${formatDuration(totals.latencyMs)} · ${tokens} · ${cost}`;
    ledgerEmpty.hidden = history.length > 0;
    ledgerHelp.hidden = history.length === 0;
    resetButton.disabled = history.length === 0;
    ledgerList.replaceChildren();
    history.slice().reverse().forEach((entry) => {
      const item = document.createElement("li");
      item.dataset.sessionId = String(entry.id);
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Restore artwork for ${entry.prompt}`);
      item.title = "Restore this artwork";
      const heading = document.createElement("div");
      heading.className = "ledger-entry-heading";
      const prompt = document.createElement("span");
      prompt.textContent = `“${entry.prompt}”`;
      prompt.title = entry.prompt;
      const outcome = document.createElement("strong");
      outcome.textContent = entry.source === "sandbox-code"
        ? entry.autoRoute ? "Jev → Custom code + Sandbox" : "Custom code + Sandbox"
        : entry.source === "image-generation"
          ? imageModelLabel(entry.model)
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
      entry.steps.filter((step) => step.stage !== "sandbox-execution").forEach((step) => {
        const row = document.createElement("li");
        const stage = document.createElement("span");
        stage.textContent = step.stage === "composition-route"
          ? "Jev · route check"
          : step.stage === "image-generation"
          ? `${imageModelLabel(step.model)} · image`
          : step.stage === "model-code"
          ? `${comparisonModelLabel(step.model)} · JavaScript`
          : step.stage === "thesis"
          ? "Jev · visual direction"
          : step.stage === "thesis-refinement"
            ? "Jev · uncertain choices rechecked"
            : step.stage === "model-composition" ? `${comparisonModelLabel(step.model)} · one-shot` : "Jev · renderer choices";
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

  function setPending(pending, { live = false } = {}) {
    promptInput.disabled = pending && !live;
    submitButton.disabled = pending;
    compositionModeButtons.forEach((button) => { button.disabled = pending; });
    comparisonModel.disabled = pending;
    imageModel.disabled = pending;
    submitButton.textContent = pending ? live ? "Updating…" : "Composing…" : "Compose";
  }

  function clearArtMorph() {
    if (artMorphTimer !== null) window.clearTimeout(artMorphTimer);
    artMorphTimer = null;
    canvasRoot.querySelectorAll(".art-morph-ghost").forEach((ghost) => ghost.remove());
  }

  function applyArtSpec(nextSpec, { morph = false } = {}) {
    const sourceCanvas = canvasRoot.querySelector("canvas:not(.art-morph-ghost)");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!morph || !sourceCanvas || reduceMotion) {
      clearArtMorph();
      updateArtSpec(nextSpec);
      return;
    }

    clearArtMorph();
    const ghost = document.createElement("canvas");
    ghost.className = "art-morph-ghost";
    ghost.width = sourceCanvas.width;
    ghost.height = sourceCanvas.height;
    ghost.setAttribute("aria-hidden", "true");
    ghost.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
    canvasRoot.append(ghost);
    updateArtSpec(nextSpec);
    window.requestAnimationFrame(() => ghost.setAttribute("data-fading", "true"));
    artMorphTimer = window.setTimeout(() => {
      ghost.remove();
      artMorphTimer = null;
    }, 480);
  }

  function scheduleLiveCompose() {
    if (compositionMode !== "jev" || comparisonModel.value !== "jev") return;
    const prompt = promptInput.value.trim();
    if (prompt.length < 3) {
      promptMessage.textContent = prompt ? "Keep typing to start the Jev live preview." : "";
      promptMessage.dataset.tone = "pending";
      return;
    }
    if (liveRequestRunning) {
      queuedLivePrompt = prompt;
      return;
    }
    promptMessage.textContent = "Jev live preview will update as you type…";
    promptMessage.dataset.tone = "pending";
    compose(prompt, { live: true });
  }

  function clearSandboxCountdown() {
    if (sandboxCountdownTimer !== null) window.clearInterval(sandboxCountdownTimer);
    sandboxCountdownTimer = null;
    sandboxStatus.hidden = true;
    sandboxStatus.removeAttribute("data-state");
  }

  function startSandboxCountdown(result) {
    clearSandboxCountdown();
    const expiresAt = Number.isFinite(result.expiresAt) ? result.expiresAt : Date.now() + result.expiresInMs;
    const routePrefix = result.autoRoute ? "Jev routed this prompt to custom code. " : "";
    const expirationTime = new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    sandboxStatus.hidden = false;
    sandboxStatus.dataset.state = "live";
    const update = () => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      if (remainingSeconds <= 0) {
        if (sandboxCountdownTimer !== null) window.clearInterval(sandboxCountdownTimer);
        sandboxCountdownTimer = null;
        sandboxStatus.dataset.state = "expired";
        sandboxStatusLabel.textContent = "EXPIRED · RECOMPOSE";
        sandboxStatus.hidden = compositionMode !== "code" || sandboxPreview.hidden;
        promptMessage.textContent = `${result.title} preview expired. Compose again to create a new Sandbox.`;
        promptMessage.title = `The temporary Sandbox expired at ${expirationTime}.`;
        promptMessage.dataset.tone = "error";
        return;
      }
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = String(remainingSeconds % 60).padStart(2, "0");
      sandboxStatusLabel.textContent = `LIVE · VERCEL SANDBOX · ${minutes}:${seconds}`;
      promptMessage.textContent = `${routePrefix}${result.title} is live in Vercel Sandbox · ${result.latencyMs} ms total · expires in ${minutes}:${seconds}.`;
      promptMessage.title = `Total time includes code generation, Sandbox validation, and preview startup. The isolated preview expires at ${expirationTime}.`;
    };
    update();
    sandboxCountdownTimer = window.setInterval(update, 1_000);
  }

  function restoreSession(entry) {
    const result = entry?.snapshot;
    if (!result) {
      promptMessage.textContent = "This earlier session does not contain a restorable visual.";
      promptMessage.dataset.tone = "error";
      return;
    }
    promptInput.value = entry.prompt;
    if (result.mode === "image") {
      clearSandboxCountdown();
      lastImagePreview = result.image.dataUrl;
      setCompositionMode("image", { preserveCanvas: true });
      imagePreview.src = result.image.dataUrl;
      imagePreview.hidden = false;
      sandboxPreview.hidden = true;
      canvasRoot.hidden = true;
      status.textContent = `${imageModelLabel(result.model)} · restored generated image`;
      renderImageTrace(result);
      promptMessage.textContent = "Restored this session’s generated image.";
    } else if (result.mode === "code") {
      if (!Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) {
        promptMessage.textContent = "This Sandbox preview has expired. Compose the prompt again to recreate it.";
        promptMessage.title = "Sandbox previews are temporary and cannot be reopened after expiration.";
        promptMessage.dataset.tone = "error";
        return;
      }
      clearSandboxCountdown();
      lastSandboxPreview = result.previewUrl;
      setCompositionMode("code", { preserveCanvas: true });
      sandboxPreview.src = result.previewUrl;
      sandboxPreview.hidden = false;
      imagePreview.hidden = true;
      canvasRoot.hidden = true;
      status.textContent = `${result.title} · restored sandbox preview`;
      renderCodeTrace(result);
      startSandboxCountdown(result);
    } else {
      clearSandboxCountdown();
      comparisonModel.value = result.mode === "model" ? result.model : "jev";
      setCompositionMode(result.mode === "model" ? "model" : "jev", { preserveCanvas: true });
      updateArtSpec(result.spec);
      sandboxPreview.hidden = true;
      imagePreview.hidden = true;
      canvasRoot.hidden = false;
      const source = result.mode === "model" ? comparisonModelLabel(result.model) : "Jev";
      renderTrace({ source, model: result.model, latencyMs: result.latencyMs, appliedDecisionCount: result.appliedDecisionCount, skippedDecisionCount: result.skippedDecisionCount, omittedCount: result.omitted.length, averageConfidence: result.averageConfidence, highlights: result.highlights, decisionTrace: result.trace, autoRoute: result.autoRoute });
      promptMessage.textContent = "Restored this session’s artwork. See Decision Trace for details.";
      promptMessage.removeAttribute("title");
    }
    promptMessage.dataset.tone = "success";
  }

  function onLedgerActivate(event) {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest("[data-session-id]");
    if (!item) return;
    if (event.type === "keydown") event.preventDefault();
    const entry = getSessionHistory().find(({ id }) => id === Number(item.dataset.sessionId));
    if (entry) restoreSession(entry);
  }

  function setCompositionMode(mode, { preserveCanvas = false } = {}) {
    if (mode !== "jev") {
      queuedLivePrompt = "";
    }
    compositionMode = mode;
    compositionModeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.compositionMode === mode)));
    modelPicker.dataset.active = String(mode === "jev" || mode === "model");
    imageModelPicker.dataset.active = String(mode === "image");
    if (preserveCanvas) return;
    const showSandbox = mode === "code" && Boolean(lastSandboxPreview);
    const showImage = mode === "image" && Boolean(lastImagePreview);
    sandboxPreview.hidden = !showSandbox;
    imagePreview.hidden = !showImage;
    sandboxStatus.hidden = !showSandbox;
    if (showImage) imagePreview.src = lastImagePreview;
    canvasRoot.hidden = showSandbox || showImage;
    if (!showSandbox && !showImage) renderSpec(getArtSpec());
  }

  async function compose(prompt, { live = false } = {}) {
    const requestedMode = compositionMode;
    if (live) liveRequestRunning = true;
    clearSandboxCountdown();
    setPending(true, { live });
    promptMessage.textContent = requestedMode === "model"
      ? "The comparison model is generating all 80 renderer decisions in one structured response…"
      : requestedMode === "code"
        ? "Writing custom Javascript with the canvas-sketch framework, then using Vercel Sandbox to validate and run..."
        : requestedMode === "image"
          ? `${imageModelLabel(imageModel.value)} is generating an image directly from your prompt…`
        : "Jev is checking whether the fixed renderer can express this prompt…";
    promptMessage.dataset.tone = "pending";
    promptMessage.removeAttribute("title");
    renderPending(requestedMode);
    try {
      const result = await requestArtComposition(prompt, {
        mode: requestedMode,
        model: requestedMode === "model" ? comparisonModel.value : requestedMode === "image" ? imageModel.value : undefined,
        live,
        onProgress: renderProgress,
      });
      if (live && compositionMode !== "jev") return;
      if (result.mode === "image") {
        lastImagePreview = result.image.dataUrl;
        imagePreview.src = result.image.dataUrl;
        imagePreview.hidden = false;
        sandboxPreview.hidden = true;
        canvasRoot.hidden = true;
        status.textContent = `${imageModelLabel(result.model)} · generated image`;
      } else if (result.mode === "code") {
        lastSandboxPreview = result.previewUrl;
        sandboxPreview.src = result.previewUrl;
        sandboxPreview.hidden = false;
        imagePreview.hidden = true;
        canvasRoot.hidden = true;
        status.textContent = `${result.title} · isolated sandbox preview`;
      } else {
        applyArtSpec(result.spec, { morph: live });
        sandboxPreview.hidden = true;
        imagePreview.hidden = true;
        canvasRoot.hidden = false;
      }
      if (result.mode === "image") {
        renderImageTrace(result);
      } else if (result.mode === "code") {
        renderCodeTrace(result);
      } else {
        const source = result.mode === "model" ? comparisonModelLabel(result.model) : "Jev";
        renderTrace({ source, model: result.model, latencyMs: result.latencyMs, appliedDecisionCount: result.appliedDecisionCount, skippedDecisionCount: result.skippedDecisionCount, omittedCount: result.omitted.length, averageConfidence: result.averageConfidence, highlights: result.highlights, decisionTrace: result.trace, autoRoute: result.autoRoute });
      }
      recordSessionRequest({
        prompt,
        outcome: result.mode === "code" ? "preview live" : result.mode === "image" ? "image generated" : `${result.appliedDecisionCount} applied`,
        steps: result.receipts.filter((receipt) => receipt.stage !== "sandbox-execution"),
        source: result.source,
        model: result.model,
        autoRoute: result.autoRoute,
        snapshot: result,
      });
      if (result.mode === "code") {
        startSandboxCountdown(result);
      } else if (result.mode === "image") {
        promptMessage.textContent = `Generated with ${imageModelLabel(result.model)} in ${formatDuration(result.latencyMs)}.`;
        promptMessage.removeAttribute("title");
      } else if (live) {
        promptMessage.textContent = `Jev updated the canvas in ${formatDuration(result.latencyMs)}.`;
        promptMessage.title = "Live Jev requests populate the fixed renderer directly and do not reroute to custom code.";
      } else if (result.mode === "model") {
        promptMessage.textContent = "See Decision Trace for details.";
        promptMessage.removeAttribute("title");
      } else {
        promptMessage.textContent = "See Decision Trace for details.";
        promptMessage.removeAttribute("title");
      }
      promptMessage.dataset.tone = "success";
    } catch (error) {
      if (live && (compositionMode !== "jev" || promptInput.value.trim() !== prompt)) return;
      const failedStage = {
        "code-generation": "writing the custom JavaScript",
        "sandbox-create": "creating the Vercel Sandbox",
        "syntax-check": "checking the generated JavaScript",
        "runtime-check": "validating the generated JavaScript",
        "preview-start": "starting the Sandbox preview",
        "preview-ready": "opening the Sandbox preview",
      }[error.stage];
      const codeFailure = requestedMode === "code" || error.code === "CODE_COMPOSITION_FAILED";
      const codeFailureDetail = error.detail ?? (error.code === "INVALID_REQUEST" ? error.message : null);
      const codeFailureMessage = codeFailureDetail
        ? `Custom code + Sandbox failed${failedStage ? ` while ${failedStage}` : ""}: ${codeFailureDetail}`
        : `Custom code + Sandbox failed${failedStage ? ` while ${failedStage}` : ""}. The generated result can vary, so try composing it again.`;
      trace.dataset.status = "error";
      trace.dataset.source = "error";
      traceSource.textContent = codeFailure && failedStage ? `Failed while ${failedStage}` : "Composition unavailable";
      traceMeta.textContent = codeFailureDetail ?? error.detail ?? "Artwork unchanged";
      promptMessage.textContent = error.code === "MISSING_AI_GATEWAY_AUTH"
        ? "Add AI_GATEWAY_API_KEY to compose through AI Gateway."
        : error.code === "MISSING_SANDBOX_AUTH"
          ? "Link this project to Vercel and pull its environment to enable Sandbox previews."
          : codeFailure
            ? codeFailureMessage
            : `${requestedMode === "model" ? "The comparison model" : requestedMode === "image" ? "The image model" : "Jev"} could not compose this piece: ${error.detail ?? error.message}`;
      promptMessage.dataset.tone = "error";
      if (codeFailure) promptMessage.title = "The previous artwork remains on the canvas. You can retry the same prompt.";
      else promptMessage.removeAttribute("title");
    } finally {
      if (live) liveRequestRunning = false;
      setPending(false);
      if (live && queuedLivePrompt) {
        const nextPrompt = queuedLivePrompt;
        queuedLivePrompt = "";
        if (compositionMode === "jev" && promptInput.value.trim() === nextPrompt) scheduleLiveCompose();
      }
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    queuedLivePrompt = "";
    const prompt = promptInput.value.trim();
    if (!prompt) {
      promptInput.setAttribute("aria-invalid", "true");
      promptMessage.textContent = "Describe an artwork before composing.";
      promptMessage.dataset.tone = "error";
      promptMessage.removeAttribute("title");
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
    scheduleLiveCompose();
  }

  function onCompositionMode(event) {
    const button = event.target.closest("[data-composition-mode]");
    if (!button || button.disabled) return;
    queuedLivePrompt = "";
    setCompositionMode(button.dataset.compositionMode);
  }

  function onComparisonModelActivate(event) {
    if (!comparisonModel.disabled) {
      setCompositionMode(comparisonModel.value === "jev" ? "jev" : "model");
      if (event.type === "change" && comparisonModel.value === "jev") scheduleLiveCompose();
      else if (comparisonModel.value !== "jev") {
        queuedLivePrompt = "";
      }
    }
  }

  function onImageModelActivate() {
    if (!imageModel.disabled) {
      queuedLivePrompt = "";
      setCompositionMode("image");
    }
  }

  function onReset() {
    clearSandboxCountdown();
    clearSessionHistory();
    const spec = resetArtSpec();
    lastSandboxPreview = "";
    lastImagePreview = "";
    sandboxPreview.removeAttribute("src");
    sandboxPreview.hidden = true;
    imagePreview.removeAttribute("src");
    imagePreview.hidden = true;
    canvasRoot.hidden = false;
    renderTrace({ highlights: defaultHighlights(spec) });
    promptMessage.textContent = "Session receipt cleared and the default composition restored.";
    promptMessage.dataset.tone = "success";
    promptMessage.removeAttribute("title");
  }

  promptForm.addEventListener("submit", onSubmit);
  promptInput.addEventListener("input", scheduleLiveCompose);
  compositionModeButtons.forEach((button) => button.addEventListener("click", onCompositionMode));
  comparisonModel.addEventListener("focus", onComparisonModelActivate);
  comparisonModel.addEventListener("change", onComparisonModelActivate);
  imageModel.addEventListener("focus", onImageModelActivate);
  imageModel.addEventListener("change", onImageModelActivate);
  examples.addEventListener("click", onExample);
  resetButton.addEventListener("click", onReset);
  ledgerList.addEventListener("click", onLedgerActivate);
  ledgerList.addEventListener("keydown", onLedgerActivate);
  const unsubscribeSpec = subscribeToArtSpec(renderSpec);
  const unsubscribeHistory = subscribeToSessionHistory(renderHistory);
  renderSpec(getArtSpec());
  setCompositionMode("jev");
  renderTrace();
  renderHistory(getSessionHistory());
  return () => {
    clearSandboxCountdown();
    clearArtMorph();
    promptForm.removeEventListener("submit", onSubmit);
    promptInput.removeEventListener("input", scheduleLiveCompose);
    compositionModeButtons.forEach((button) => button.removeEventListener("click", onCompositionMode));
    comparisonModel.removeEventListener("focus", onComparisonModelActivate);
    comparisonModel.removeEventListener("change", onComparisonModelActivate);
    imageModel.removeEventListener("focus", onImageModelActivate);
    imageModel.removeEventListener("change", onImageModelActivate);
    examples.removeEventListener("click", onExample);
    resetButton.removeEventListener("click", onReset);
    ledgerList.removeEventListener("click", onLedgerActivate);
    ledgerList.removeEventListener("keydown", onLedgerActivate);
    unsubscribeSpec();
    unsubscribeHistory();
  };
}
