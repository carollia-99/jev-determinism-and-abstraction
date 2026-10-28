import { createDefaultArtSpec } from "../shared/art-grammar.js";

let artSpec = Object.freeze(createDefaultArtSpec());
const listeners = new Set();

export function getArtSpec() {
  return artSpec;
}

export function updateArtSpec(nextSpec) {
  if (!nextSpec || !Array.isArray(nextSpec.layers) || nextSpec.layers.length !== 4) {
    throw new TypeError("Artwork specification is invalid.");
  }
  artSpec = Object.freeze(nextSpec);
  listeners.forEach((listener) => listener(artSpec));
  return artSpec;
}

export function resetArtSpec() {
  return updateArtSpec(createDefaultArtSpec());
}

export function subscribeToArtSpec(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
