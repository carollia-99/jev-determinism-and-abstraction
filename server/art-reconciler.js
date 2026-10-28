import { artSpecFromAnswers, buildArtQuestions } from "../shared/art-grammar.js";

export const THESIS_QUESTIONS = Object.freeze({
  fieldIntent: {
    type: "choice",
    instructions: "Choose the primary visual medium requested. Prefer a literal gradient or solid field when explicitly requested; otherwise decide whether marks are needed.",
    criteria: {
      GRADIENT: "A clean gradient field without marks.",
      GRADIENT_AND_MARKS: "A gradient plus visible generative marks.",
      MARKS: "Generative marks on a flat field.",
      SOLID: "A minimal solid-color field.",
    },
  },
  subject: {
    type: "choice",
    instructions: "Choose the closest visual metaphor for the prompt.",
    criteria: {
      LIGHT: "Sunlight, glow, radiance, or illumination.",
      CELESTIAL: "Space, stars, planets, or orbit.",
      BOTANICAL: "Plants, gardens, growth, or living organic forms.",
      GEOMETRIC: "Order, architecture, geometry, or constructed systems.",
      LANDSCAPE: "Weather, horizon, terrain, or environmental space.",
      ATMOSPHERIC: "Mist, memory, dream, softness, or diffuse mood.",
      ABSTRACT_ENERGY: "Emotion, rhythm, force, anxiety, or pure energy.",
    },
  },
  warmth: {
    type: "score",
    instructions: "Score the requested palette temperature.",
    criteria: ["Strongly cool", "Neutral or mixed", "Strongly warm"],
  },
  complexity: {
    type: "score",
    instructions: "Score the appropriate visual complexity.",
    criteria: ["Minimal and restrained", "Balanced", "Dense and maximal"],
  },
  useMotion: {
    type: "boolean",
    instructions: "Should visible animation materially improve this artwork? Default false for static fields and poster-like requests.",
  },
  useTexture: {
    type: "boolean",
    instructions: "Should tactile grain, mist, or scratches materially improve this artwork?",
  },
  useSymmetry: {
    type: "boolean",
    instructions: "Does the prompt strongly call for visible symmetry?",
  },
  literalness: {
    type: "score",
    instructions: "Score how literally the renderer should preserve named visual properties.",
    criteria: ["Poetic interpretation", "Balanced interpretation", "Strictly literal"],
  },
});

const OPTIONAL_DEFAULTS = Object.freeze({
  texture: "CLEAN",
  symmetry: "NONE",
  motion: "STILL",
  turbulence: "NONE",
  edgeBehavior: "CONTAINED",
});

const COLOR_COMPANIONS = Object.freeze({
  RED: ["ORANGE", "CREAM"], ORANGE: ["YELLOW", "RED"], YELLOW: ["ORANGE", "CREAM"],
  LIME: ["GREEN", "YELLOW"], GREEN: ["TEAL", "LIME"], TEAL: ["CYAN", "GREEN"],
  CYAN: ["BLUE", "WHITE"], BLUE: ["CYAN", "VIOLET"], INDIGO: ["VIOLET", "CYAN"],
  VIOLET: ["MAGENTA", "BLUE"], MAGENTA: ["PINK", "VIOLET"], PINK: ["MAGENTA", "CREAM"],
  BROWN: ["ORANGE", "CREAM"], BLACK: ["GRAY", "WHITE"], WHITE: ["GRAY", "BLACK"],
  CREAM: ["YELLOW", "BROWN"], GRAY: ["WHITE", "BLACK"],
});

export function answerConfidence(answer) {
  if (!answer) return null;
  if (answer.type === "boolean" || Number.isFinite(answer.probability)) {
    return Number.isFinite(answer.probability) ? Math.max(answer.probability, 1 - answer.probability) : null;
  }
  const probabilities = Object.values(answer.probabilities ?? {}).filter(Number.isFinite);
  if (answer.type === "score" || Number.isFinite(answer.score)) return probabilities.length ? Math.max(...probabilities) : null;
  const selected = answer.probabilities?.[answer.choice];
  return Number.isFinite(selected) ? selected : null;
}

function choiceIsReliable(answer) {
  if (!answer?.probabilities || !answer.choice) return true;
  const ranked = Object.values(answer.probabilities).filter(Number.isFinite).sort((a, b) => b - a);
  const selected = answer.probabilities[answer.choice];
  const margin = selected - (ranked[1] ?? 0);
  return selected >= 0.55 || (selected >= 0.35 && margin >= 0.15);
}

export function thesisFromAnswers(answers) {
  return {
    fieldIntent: answers.fieldIntent.choice,
    subject: answers.subject.choice,
    warmth: answers.warmth.score,
    complexity: answers.complexity.score,
    useMotion: answers.useMotion.probability >= 0.62,
    useTexture: answers.useTexture.probability >= 0.62,
    useSymmetry: answers.useSymmetry.probability >= 0.62,
    literalness: answers.literalness.score,
  };
}

export function buildRelevantArtQuestions(thesis) {
  const questions = buildArtQuestions();
  delete questions.fieldTreatment;
  const remove = (keys) => keys.forEach((key) => delete questions[key]);
  const layerKeys = Object.keys(questions).filter((key) => key.startsWith("layer"));

  if (thesis.fieldIntent === "GRADIENT" || thesis.fieldIntent === "SOLID") {
    remove(layerKeys);
    remove(["paletteFamily", "paletteHarmony", "primaryColor", "secondaryColor", "accentColor", "lineCharacter", "shapeLanguage", "motion", "tempo", "rhythm", "turbulence", "edgeBehavior"]);
  } else if (thesis.fieldIntent === "MARKS") {
    remove(["gradient", "gradientStartColor", "gradientEndColor", "gradientDirection"]);
  }
  if (!thesis.useMotion) remove(["motion", "tempo", "rhythm"]);
  if (!thesis.useTexture) remove(["texture"]);
  if (!thesis.useSymmetry) remove(["symmetry"]);
  return questions;
}

function explicitColors(prompt) {
  const names = Object.keys(COLOR_COMPANIONS);
  return [...prompt.toUpperCase().matchAll(new RegExp(`\\b(${names.join("|")})\\b`, "g"))].map((match) => match[1]);
}

export function reconcileArtSpec({ prompt, thesis, answers, seed }) {
  const spec = artSpecFromAnswers(answers, seed);
  const omitted = [];
  const repairs = [];
  spec.fieldTreatment = thesis.fieldIntent;
  if (!thesis.useMotion) spec.motion = "STILL";
  if (!thesis.useTexture) spec.texture = "CLEAN";
  if (!thesis.useSymmetry) spec.symmetry = "NONE";

  for (const [key, fallback] of Object.entries(OPTIONAL_DEFAULTS)) {
    if (answers[key] && !choiceIsReliable(answers[key])) {
      spec[key] = fallback;
      omitted.push(key);
    }
  }

  spec.layers = spec.layers.map((layer, index) => {
    const next = { ...layer };
    for (const [key, fallback] of Object.entries({ noise: "NONE", blendMode: "NORMAL", rotation: "ALIGNED" })) {
      const answerKey = `layer${index + 1}_${key}`;
      if (answers[answerKey] && !choiceIsReliable(answers[answerKey])) {
        next[key] = fallback;
        omitted.push(answerKey);
      }
    }
    return next;
  });

  const namedColors = explicitColors(prompt);
  if (spec.gradientStartColor === spec.gradientEndColor && namedColors.length < 2) {
    spec.gradientEndColor = COLOR_COMPANIONS[spec.gradientStartColor][0];
    repairs.push("gradient contrast derived from its anchor color");
  }
  if (spec.primaryColor === spec.secondaryColor && spec.secondaryColor === spec.accentColor && namedColors.length < 2) {
    const [secondary, accent] = COLOR_COMPANIONS[spec.primaryColor];
    spec.secondaryColor = secondary;
    spec.accentColor = accent;
    repairs.push("palette harmony derived from its anchor color");
  }

  const lightBackground = ["WHITE", "CREAM", "YELLOW"].includes(spec.background);
  if (lightBackground) {
    spec.layers = spec.layers.map((layer, index) => {
      if (layer.blendMode !== "SCREEN" && layer.blendMode !== "LIGHTEN") return layer;
      repairs.push(`layer ${index + 1} blend made visible on a light field`);
      return { ...layer, blendMode: "MULTIPLY" };
    });
  }

  return { spec, omitted, repairs };
}
