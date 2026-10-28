import { getArtState, subscribeToArtState, updateArtState } from "./art-state.js";
import {
  clearSessionCapabilities,
  getSessionCapabilities,
  registerSessionCapability,
  subscribeToSessionCapabilities,
} from "./capability-registry.js";
import { interpretPrompt } from "./interpreter.js";
import { requestCapabilityProposal, requestJevInterpretation } from "./interpretation-client.js";
import {
  clearSessionHistory,
  getSessionHistory,
  getSessionTotals,
  recordSessionRequest,
  subscribeToSessionHistory,
} from "./session-history.js";

function titleCase(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => `${word[0]}${word.slice(1)}`)
    .join(" ");
}

const TRACE_DIMENSIONS = Object.freeze(["motion", "speed", "energy"]);
const OUTCOME_LABELS = Object.freeze({
  generated: "Generated + active",
  reused: "Jev only · reused",
  applied: "Jev only · built-in",
  "generation-failed": "Generation failed",
});

function formatCost(costUsd) {
  return Number.isFinite(costUsd) ? `$${costUsd.toFixed(6)}` : "cost —";
}

function formatTokens(tokens) {
  return Number.isFinite(tokens) ? `${tokens.toLocaleString()} tok` : "tokens —";
}

export function buildTraceViewModel({ source, state, decisions, model, latencyMs, capability } = {}) {
  const sourceLabel = source === "jev" ? "Jev" : source === "local" ? "Local fallback" : "Manual control";
  const meta =
    source === "jev"
      ? `${model || "typesafe-ai/jev"} · ${latencyMs ?? "—"} ms`
      : source === "local"
        ? "Deterministic phrase map"
        : "Direct semantic state";

  const capabilityView =
    source === "jev" && capability
      ? {
          status: capability.sufficient
            ? capability.action === "reuse_session"
              ? "session"
              : "existing"
            : "missing",
          verdict: capability.sufficient
            ? capability.action === "reuse_session"
              ? "Session reuse"
              : "Existing"
            : "New required",
          confidence: Number.isFinite(capability.confidence) ? capability.confidence : null,
        }
      : {
          status: source === "local" ? "local" : "manual",
          verdict: source === "local" ? "Local match" : "Direct",
          confidence: null,
        };

  return {
    source,
    sourceLabel,
    meta,
    capability: capabilityView,
    rows: TRACE_DIMENSIONS.map((dimension) => {
      const confidence = decisions?.[dimension]?.confidence;
      return {
        dimension,
        choice: capabilityView.status === "missing" ? "—" : decisions?.[dimension]?.choice ?? state?.[dimension] ?? "—",
        confidence:
          capabilityView.status === "missing" ? null : Number.isFinite(confidence) ? confidence : null,
      };
    }),
  };
}

export function mountControls({
  modeControls,
  promptForm,
  promptInput,
  promptMessage,
  status,
  trace,
  sessionLedger,
}) {
  let buttons = [...modeControls.querySelectorAll("[data-motion]")];
  const submitButton = promptForm.querySelector("button[type='submit']");
  const traceSource = trace.querySelector("[data-trace-source]");
  const traceMeta = trace.querySelector("[data-trace-meta]");
  const traceVerdict = trace.querySelector("[data-trace-verdict]");
  const traceCapabilityConfidence = trace.querySelector("[data-trace-capability-confidence]");
  const traceProposal = trace.querySelector("[data-trace-proposal]");
  const proposalStatus = trace.querySelector("[data-proposal-status]");
  const proposalName = trace.querySelector("[data-proposal-name]");
  const proposalDescription = trace.querySelector("[data-proposal-description]");
  const proposalMeta = trace.querySelector("[data-proposal-meta]");
  const proposalCode = trace.querySelector("[data-proposal-code]");
  const proposalCodeDetails = trace.querySelector("[data-proposal-code-details]");
  const proposalCodeSummary = proposalCodeDetails.querySelector("summary");
  const traceRows = new Map(
    [...trace.querySelectorAll("[data-trace-dimension]")].map((row) => [row.dataset.traceDimension, row]),
  );
  const ledgerTotal = sessionLedger.querySelector("[data-ledger-total]");
  const ledgerEmpty = sessionLedger.querySelector("[data-ledger-empty]");
  const ledgerList = sessionLedger.querySelector("[data-ledger-list]");
  const resetSessionButton = sessionLedger.querySelector("[data-reset-session]");

  function renderSessionHistory(history) {
    const totals = getSessionTotals(history);
    const costPrefix = totals.pricedCalls > 0 && totals.pricedCalls < totals.calls ? "≥ " : "";
    const costLabel = totals.pricedCalls > 0 ? `${costPrefix}$${totals.costUsd.toFixed(6)}` : "cost —";
    const tokenLabel = totals.tokenizedCalls > 0 ? `${totals.tokens.toLocaleString()} tokens` : "tokens —";
    ledgerTotal.textContent = `${totals.calls} ${totals.calls === 1 ? "call" : "calls"} · ${tokenLabel} · ${costLabel}`;
    ledgerEmpty.hidden = history.length > 0;
    resetSessionButton.disabled = history.length === 0 && getSessionCapabilities().length === 0;
    ledgerList.replaceChildren();

    history
      .slice(-3)
      .reverse()
      .forEach((entry) => {
        const item = document.createElement("li");
        const heading = document.createElement("div");
        heading.className = "ledger-entry-heading";
        const promptText = document.createElement("span");
        promptText.textContent = `“${entry.prompt}”`;
        promptText.title = entry.prompt;
        const outcome = document.createElement("strong");
        outcome.textContent = OUTCOME_LABELS[entry.outcome] ?? entry.outcome;
        heading.append(promptText, outcome);

        const steps = document.createElement("ul");
        steps.className = "ledger-steps";
        entry.steps.forEach((step) => {
          const row = document.createElement("li");
          const stage = document.createElement("span");
          stage.textContent = step.stage === "generation" ? "Generate" : "Jev";
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

  function renderTrace(viewModel) {
    traceProposal.hidden = true;
    proposalCodeDetails.open = false;
    trace.dataset.source = viewModel.source;
    trace.dataset.status = "complete";
    traceSource.textContent = viewModel.sourceLabel;
    traceMeta.textContent = viewModel.meta;
    trace.dataset.capability = viewModel.capability.status;
    traceVerdict.textContent = viewModel.capability.verdict;
    traceCapabilityConfidence.textContent =
      viewModel.capability.confidence === null
        ? "—"
        : `${Math.round(viewModel.capability.confidence * 100)}%`;

    viewModel.rows.forEach(({ dimension, choice, confidence }) => {
      const row = traceRows.get(dimension);
      row.querySelector("[data-trace-choice]").textContent = choice;
      row.querySelector("[data-trace-confidence]").textContent =
        confidence === null ? "—" : `${Math.round(confidence * 100)}%`;
      row.querySelector("[data-trace-meter]").style.setProperty(
        "--confidence",
        confidence === null ? "0%" : `${Math.round(confidence * 100)}%`,
      );
    });
  }

  function renderPendingTrace() {
    traceProposal.hidden = true;
    proposalCodeDetails.open = false;
    trace.dataset.source = "jev";
    trace.dataset.status = "pending";
    traceSource.textContent = "Jev is deciding";
    traceMeta.textContent = "typesafe-ai/jev-1.14.0 · Vercel AI Gateway";
    trace.dataset.capability = "pending";
    traceVerdict.textContent = "Checking";
    traceCapabilityConfidence.textContent = "—";
  }

  function renderGeneratingProposal() {
    trace.dataset.source = "capability-model";
    trace.dataset.status = "pending";
    trace.dataset.capability = "missing";
    traceSource.textContent = "Jev → capability model";
    traceMeta.textContent = "Vercel AI Gateway · generating motion-v1";
    traceVerdict.textContent = "New required";
    traceProposal.hidden = false;
    proposalStatus.textContent = "Drafting";
    proposalName.textContent = "MOTION_V1";
    proposalDescription.textContent = "Creating a bounded proposal. The artwork remains unchanged.";
    proposalMeta.textContent = "Unexecuted · no Sandbox validation yet";
    proposalCode.textContent = "";
    proposalCodeDetails.hidden = true;
  }

  function renderCapabilityProposal(result) {
    const { proposal } = result;
    trace.dataset.source = "capability-model";
    trace.dataset.status = "complete";
    trace.dataset.capability = "proposed";
    traceSource.textContent = "Jev → capability model";
    traceMeta.textContent = `${result.model} · ${result.latencyMs} ms`;
    traceVerdict.textContent = "Capability added";
    traceCapabilityConfidence.textContent = "—";
    traceProposal.hidden = false;
    proposalStatus.textContent = "Active locally";
    proposalName.textContent = proposal.name;
    proposalDescription.textContent = proposal.description;
    proposalMeta.textContent = `${proposal.contract} · unsafe local execution · Sandbox deferred`;
    proposalCode.textContent = proposal.code;
    proposalCodeSummary.textContent = "View locally executed JavaScript";
    proposalCodeDetails.hidden = false;
    proposalCodeDetails.open = false;
  }

  function renderSessionCapabilities(capabilities) {
    modeControls.querySelectorAll("[data-session-capability]").forEach((button) => button.remove());
    capabilities.forEach((capability, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.motion = capability.name;
      button.dataset.sessionCapability = "true";
      button.setAttribute("aria-pressed", "false");
      button.title = `${capability.description} Sandbox deferred.`;
      const number = document.createElement("span");
      number.textContent = String(index + 5).padStart(2, "0");
      button.append(number, document.createTextNode(` ${titleCase(capability.name)}`));
      modeControls.append(button);
    });
    buttons = [...modeControls.querySelectorAll("[data-motion]")];
    render(getArtState());
  }

  function render(state) {
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.motion === state.motion));
    });
    status.textContent = `${titleCase(state.motion)} · ${state.speed.toLowerCase()} speed · ${state.energy.toLowerCase()} energy`;
  }

  function onModeClick(event) {
    const button = event.target.closest("[data-motion]");
    if (!button) return;
    updateArtState({ motion: button.dataset.motion });
    promptMessage.textContent = `Manual mode: ${titleCase(button.dataset.motion)}`;
    promptMessage.dataset.tone = "success";
    renderTrace(buildTraceViewModel({ source: "manual", state: getArtState() }));
  }

  function onResetSession() {
    updateArtState({ motion: "DRIFT", speed: "MEDIUM", energy: "MEDIUM" });
    clearSessionCapabilities();
    clearSessionHistory();
    promptMessage.textContent = "Session history and learned capabilities cleared.";
    promptMessage.dataset.tone = "success";
    renderTrace(buildTraceViewModel({ source: "manual", state: getArtState() }));
  }

  function setPending(isPending, pendingLabel = "Deciding…") {
    promptInput.disabled = isPending;
    submitButton.disabled = isPending;
    submitButton.textContent = isPending ? pendingLabel : "Apply";
    promptForm.setAttribute("aria-busy", String(isPending));
  }

  function showAppliedState(nextState, prefix) {
    promptMessage.textContent = `${prefix}: ${titleCase(nextState.motion)}, ${nextState.speed.toLowerCase()} speed, ${nextState.energy.toLowerCase()} energy.`;
    promptMessage.dataset.tone = "success";
  }

  async function onPromptSubmit(event) {
    event.preventDefault();
    const prompt = promptInput.value.trim();

    if (!prompt) {
      promptMessage.textContent = "Enter a description before applying.";
      promptMessage.dataset.tone = "error";
      promptInput.setAttribute("aria-invalid", "true");
      promptInput.focus();
      return;
    }

    promptInput.removeAttribute("aria-invalid");
    setPending(true);
    promptMessage.textContent = "Jev is deciding through Vercel AI Gateway…";
    promptMessage.dataset.tone = "pending";
    renderPendingTrace();

    const currentState = getArtState();
    let result;

    try {
      result = await requestJevInterpretation(prompt, currentState, getSessionCapabilities());
    } catch (error) {
      const fallbackState = interpretPrompt(prompt);

      if (fallbackState) {
        updateArtState(fallbackState);
        showAppliedState(fallbackState, "Local fallback");
        renderTrace(buildTraceViewModel({ source: "local", state: fallbackState }));
      } else {
        promptMessage.textContent =
          error.code === "MISSING_AI_GATEWAY_AUTH"
            ? "Add AI_GATEWAY_API_KEY to use Jev; this prompt has no local fallback."
            : `Jev unavailable: ${error.message}`;
        promptMessage.dataset.tone = "error";
        trace.dataset.source = "error";
        trace.dataset.status = "error";
        traceSource.textContent = "Decision unavailable";
        traceMeta.textContent = "Artwork state unchanged";
      }
      setPending(false);
      return;
    }

    renderTrace(buildTraceViewModel(result));

    if (result.capability.sufficient) {
      updateArtState(result.state);
      recordSessionRequest({
        prompt,
        outcome: result.capability.action === "reuse_session" ? "reused" : "applied",
        steps: [result.receipt],
      });
      showAppliedState(result.state, `Jev · ${result.latencyMs} ms`);
      setPending(false);
      return;
    }

    setPending(true, "Generating…");
    promptMessage.textContent = "Jev requested a new capability. Generating a quarantined proposal…";
    promptMessage.dataset.tone = "escalation";
    renderGeneratingProposal();

    try {
      const generation = await requestCapabilityProposal(
        prompt,
        currentState,
        result.proposedState,
        getSessionCapabilities(),
      );
      registerSessionCapability(generation.proposal);
      updateArtState({
        motion: generation.proposal.name,
        speed: result.proposedState.speed,
        energy: result.proposedState.energy,
      });
      renderCapabilityProposal(generation);
      recordSessionRequest({ prompt, outcome: "generated", steps: [result.receipt, generation.receipt] });
      promptMessage.textContent = `${generation.proposal.name} generated and active · ${generation.latencyMs} ms · Sandbox deferred.`;
      promptMessage.dataset.tone = "escalation";
    } catch (error) {
      trace.dataset.source = "error";
      trace.dataset.status = "error";
      traceSource.textContent = "Generation unavailable";
      traceMeta.textContent = "Artwork state unchanged";
      proposalStatus.textContent = "Failed";
      proposalName.textContent = "No proposal";
      proposalDescription.textContent = error.message;
      proposalMeta.textContent = "Nothing was executed";
      recordSessionRequest({ prompt, outcome: "generation-failed", steps: [result.receipt] });
      promptMessage.textContent = "Jev requested a new capability, but proposal generation failed. Artwork unchanged.";
      promptMessage.dataset.tone = "error";
    } finally {
      setPending(false);
    }
  }

  modeControls.addEventListener("click", onModeClick);
  promptForm.addEventListener("submit", onPromptSubmit);
  resetSessionButton.addEventListener("click", onResetSession);
  const unsubscribe = subscribeToArtState(render);
  const unsubscribeCapabilities = subscribeToSessionCapabilities(renderSessionCapabilities);
  const unsubscribeHistory = subscribeToSessionHistory(renderSessionHistory);
  renderSessionCapabilities(getSessionCapabilities());
  renderSessionHistory(getSessionHistory());
  render(getArtState());

  return () => {
    modeControls.removeEventListener("click", onModeClick);
    promptForm.removeEventListener("submit", onPromptSubmit);
    resetSessionButton.removeEventListener("click", onResetSession);
    unsubscribe();
    unsubscribeCapabilities();
    unsubscribeHistory();
  };
}
