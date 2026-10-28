import { hasSessionCapability } from "./capability-registry.js";

export const MOTIONS = Object.freeze(["DRIFT", "JITTER", "ORBIT", "REPEL"]);
export const LEVELS = Object.freeze(["LOW", "MEDIUM", "HIGH"]);

let artState = Object.freeze({
  motion: "DRIFT",
  speed: "MEDIUM",
  energy: "MEDIUM",
});

const listeners = new Set();

export function getArtState() {
  return artState;
}

export function updateArtState(nextState) {
  const candidate = { ...artState, ...nextState };

  if (!MOTIONS.includes(candidate.motion) && !hasSessionCapability(candidate.motion)) {
    throw new TypeError(`Unknown motion: ${candidate.motion}`);
  }

  if (!LEVELS.includes(candidate.speed) || !LEVELS.includes(candidate.energy)) {
    throw new TypeError("Speed and energy must be LOW, MEDIUM, or HIGH");
  }

  artState = Object.freeze(candidate);
  listeners.forEach((listener) => listener(artState));
  return artState;
}

export function subscribeToArtState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
