export const MOTION_CONTRACT_VERSION = "motion-v1";
export const MAX_CAPABILITY_CODE_LENGTH = 6_000;

export const motionCapabilityContract = Object.freeze({
  version: MOTION_CONTRACT_VERSION,
  signature: "export function applyMotion(particle, context)",
  particle: Object.freeze(["id", "x", "y", "vx", "vy", "size", "phase"]),
  context: Object.freeze(["width", "height", "time", "deltaScale", "energy"]),
  mutation: "Only particle.vx and particle.vy may be mutated.",
});

export function validateCapabilityCode(code) {
  if (typeof code !== "string" || code.length > MAX_CAPABILITY_CODE_LENGTH) {
    throw new TypeError("The generated capability code is invalid.");
  }

  const trimmed = code.trim();
  if (!/^export function applyMotion\s*\(\s*particle\s*,\s*context\s*\)\s*\{/.test(trimmed)) {
    throw new TypeError("The generated capability does not match the motion-v1 signature.");
  }

  if ((trimmed.match(/\bexport\b/g) ?? []).length !== 1 || (trimmed.match(/\bfunction\b/g) ?? []).length !== 1) {
    throw new TypeError("The generated capability must contain exactly one exported function.");
  }

  const forbiddenApi =
    /(?:```|\bimport\s|\brequire\s*\(|\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bdocument\b|\bwindow\b|\bglobalThis\b|\bprocess\b|\blocalStorage\b|\bnavigator\b|\bconstructor\b|\bprototype\b|__proto__|\bthis\b|Math\.random\b)/;
  if (forbiddenApi.test(trimmed)) {
    throw new TypeError("The generated capability contains APIs outside the motion-v1 contract.");
  }

  const forbiddenControl = /(?:=>|\b(?:for|while|do|async|await|yield|try|catch|throw|switch|class|with|debugger|delete|new)\b|[\[\]])/;
  if (forbiddenControl.test(trimmed)) {
    throw new TypeError("The generated capability contains unsupported control flow.");
  }

  const forbiddenMutation = /particle\.(?:id|x|y|size|phase)\s*(?:\+\+|--|[+\-*/]?=)/;
  if (forbiddenMutation.test(trimmed) || /context\.[A-Za-z_$][\w$]*\s*(?:\+\+|--|[+\-*/]?=)/.test(trimmed)) {
    throw new TypeError("The generated capability mutates fields outside velocity.");
  }

  const withoutMathCalls = trimmed.replace(/Math\.[A-Za-z_$][\w$]*\s*\(/g, "");
  const callTargets = [...withoutMathCalls.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]);
  if (callTargets.some((name) => !["applyMotion", "if"].includes(name))) {
    throw new TypeError("The generated capability may call only Math functions.");
  }

  return trimmed;
}
