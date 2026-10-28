import { validateCapabilityCode } from "../shared/motion-contract.js";

const capabilities = new Map();
const listeners = new Set();

function compileMotion(code) {
  const validated = validateCapabilityCode(code);
  const functionExpression = validated.replace(/^export\s+/, "");
  // Temporary Phase 10 path: validated model output executes in the page.
  // Replace this compiler with a Sandbox-backed loader before production use.
  return Function(`"use strict"; return (${functionExpression});`)();
}

function snapshot(capability) {
  return Object.freeze({
    name: capability.name,
    description: capability.description,
    contract: capability.contract,
    execution: "unsafe-local",
  });
}

export function registerSessionCapability(proposal) {
  if (!proposal || !/^[A-Z][A-Z0-9_]{2,31}$/.test(proposal.name)) {
    throw new TypeError("Capability name is invalid.");
  }

  const capability = Object.freeze({
    ...proposal,
    applyMotion: compileMotion(proposal.code),
  });
  capabilities.set(capability.name, capability);
  listeners.forEach((listener) => listener(getSessionCapabilities()));
  return snapshot(capability);
}

export function getSessionCapabilities() {
  return [...capabilities.values()].map(snapshot);
}

export function getSessionMotion(name) {
  return capabilities.get(name)?.applyMotion ?? null;
}

export function hasSessionCapability(name) {
  return capabilities.has(name);
}

export function subscribeToSessionCapabilities(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearSessionCapabilities() {
  capabilities.clear();
  listeners.forEach((listener) => listener([]));
}
