const INTENTS = Object.freeze([
  {
    terms: ["anxious", "frantic", "panicked", "chaotic", "nervous"],
    state: { motion: "JITTER", speed: "HIGH", energy: "HIGH" },
  },
  {
    terms: ["calm", "peaceful", "serene", "relaxed", "still"],
    state: { motion: "DRIFT", speed: "LOW", energy: "LOW" },
  },
  {
    terms: ["energetic", "lively", "dynamic", "excited", "electric"],
    state: { motion: "ORBIT", speed: "HIGH", energy: "HIGH" },
  },
  {
    terms: ["repel", "scatter", "explode", "push away", "burst apart"],
    state: { motion: "REPEL", speed: "MEDIUM", energy: "HIGH" },
  },
  {
    terms: ["dreamy", "gentle", "floating", "soft"],
    state: { motion: "DRIFT", speed: "LOW", energy: "MEDIUM" },
  },
]);

export function interpretPrompt(prompt) {
  const normalized = String(prompt ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const match = INTENTS.find(({ terms }) => terms.some((term) => normalized.includes(term)));
  return match ? { ...match.state } : null;
}
