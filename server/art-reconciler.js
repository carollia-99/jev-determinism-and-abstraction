import { artSpecFromAnswers, buildArtQuestions } from "../shared/art-grammar.js";

const relevanceScore = (instructions) => ({
  type: "score",
  instructions,
  criteria: [
    "Irrelevant to the requested artwork.",
    "A possible supporting detail.",
    "Important to the visual identity.",
    "Essential; the result fails without it.",
  ],
});

export const THESIS_QUESTIONS = Object.freeze({
  fieldIntent: {
    type: "choice",
    instructions: "Choose how the requested idea should occupy the canvas. Environmental light, atmosphere, weather, and continuous substances usually need a gradient field or a field plus marks; discrete objects and textures can use marks; use solid only when minimal flat color is explicitly central.",
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
  literalness: {
    type: "score",
    instructions: "Score how literally the renderer should preserve named visual properties.",
    criteria: ["Poetic interpretation", "Balanced interpretation", "Strictly literal"],
  },
  dominantColor: {
    type: "choice",
    instructions: "Choose the single hue that must dominate the rendered area for the prompt to remain visually recognizable. Infer ordinary real-world color associations. Use MIXED only when no hue should dominate and NEUTRAL only when chromatic color is genuinely unimportant.",
    criteria: {
      RED: "Red is the essential dominant hue.",
      ORANGE: "Orange is the essential dominant hue.",
      YELLOW: "Yellow or gold is the essential dominant hue.",
      GREEN: "Green is the essential dominant hue.",
      TEAL: "Blue-green teal is the essential dominant hue.",
      CYAN: "Cyan is the essential dominant hue.",
      BLUE: "Blue is the essential dominant hue.",
      VIOLET: "Violet is the essential dominant hue.",
      PINK: "Pink is the essential dominant hue.",
      BROWN: "Brown or earth is the essential dominant hue.",
      NEUTRAL: "Black, white, cream, or gray should dominate.",
      MIXED: "No single hue should dominate.",
    },
  },
  colorCoverage: {
    type: "score",
    instructions: "How much of the canvas should the dominant hue occupy for the prompt to read correctly?",
    criteria: ["Small accents only", "A balanced share of the artwork", "Most of the visible canvas"],
  },
  formIntent: {
    type: "choice",
    instructions: "Choose the mark language that must remain recognizable. Prefer GEOMETRIC for explicit geometry, FLUID for liquids and flowing fields, LINEAR for strands or directional strokes, PARTICULATE for grains and specks, CELESTIAL for suns and orbital forms, ORGANIC for living irregular forms, and UNSPECIFIED when form is not important.",
    criteria: {
      GEOMETRIC: "Constructed circles, arcs, and polygons; avoid hair-like ribbons.",
      ORGANIC: "Irregular living curves and biological forms.",
      FLUID: "Continuous ribbons, waves, arcs, and liquid contours.",
      LINEAR: "Directional lines, blades, strands, or strokes.",
      PARTICULATE: "Dots, grains, droplets, sparks, or specks.",
      CELESTIAL: "Discs, circles, rays, arcs, and orbital marks.",
      UNSPECIFIED: "The prompt does not depend on a particular mark language.",
    },
  },
  paletteImportance: relevanceScore("How useful is deliberate color and palette treatment to expressing this prompt? Named colors make this essential."),
  compositionImportance: relevanceScore("How useful are composition and focal-structure decisions to expressing this prompt?"),
  marksImportance: relevanceScore("How useful are detailed mark-making decisions to expressing this prompt?"),
  spaceImportance: relevanceScore("How useful are negative space, depth, and edge-behavior decisions to expressing this prompt?"),
  motionImportance: relevanceScore("How useful is visible animation to expressing this prompt? Static fields and poster-like requests usually make it irrelevant."),
  textureImportance: relevanceScore("How useful are grain, mist, scratches, and surface texture to expressing this prompt?"),
  symmetryImportance: relevanceScore("How useful is explicit symmetry to expressing this prompt?"),
  atmosphereImportance: relevanceScore("How useful are contrast, saturation, opacity, and atmosphere decisions to expressing this prompt?"),
  disorderImportance: relevanceScore("How useful are randomness, turbulence, irregularity, and variation to expressing this prompt?"),
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

const relevanceValue = (answers, key) => Number.isFinite(answers[key]?.score) ? answers[key].score : 0;
export const ART_ROUTING_THRESHOLD = 1.5;

export function thesisFromAnswers(answers, literalConstraints = {}) {
  const relevance = {
    palette: relevanceValue(answers, "paletteImportance"),
    composition: relevanceValue(answers, "compositionImportance"),
    marks: relevanceValue(answers, "marksImportance"),
    space: relevanceValue(answers, "spaceImportance"),
    motion: relevanceValue(answers, "motionImportance"),
    texture: relevanceValue(answers, "textureImportance"),
    symmetry: relevanceValue(answers, "symmetryImportance"),
    atmosphere: relevanceValue(answers, "atmosphereImportance"),
    disorder: relevanceValue(answers, "disorderImportance"),
  };
  const dominantColor = answers.dominantColor.choice;
  const formIntent = answers.formIntent.choice;
  if (literalConstraints.colors?.length || !["MIXED", "NEUTRAL"].includes(dominantColor)) relevance.palette = 3;
  if (formIntent !== "UNSPECIFIED") relevance.marks = 3;
  return {
    fieldIntent: answers.fieldIntent.choice,
    subject: answers.subject.choice,
    warmth: answers.warmth.score,
    complexity: answers.complexity.score,
    literalness: answers.literalness.score,
    dominantColor,
    colorCoverage: answers.colorCoverage.score,
    formIntent,
    relevance,
    useMotion: relevance.motion >= 1.5,
    useTexture: relevance.texture >= 1.5,
    useSymmetry: relevance.symmetry >= 1.5,
  };
}

export function buildRelevantArtRouting(thesis) {
  const questions = buildArtQuestions();
  const skipped = [];
  const remove = (keys, reason, family = "structure") => keys.forEach((key) => {
    if (!Object.hasOwn(questions, key)) return;
    delete questions[key];
    skipped.push({ id: key, reason, family });
  });
  remove(["fieldTreatment"], "Set directly from the Tier 1 field intent.", "fieldIntent");
  const layerKeys = Object.keys(questions).filter((key) => key.startsWith("layer"));
  const removeLayerProperties = (properties, reason, family) =>
    remove(layerKeys.filter((key) => properties.some((property) => key.endsWith(`_${property}`))), reason, family);
  const relevant = (key, fallback = true) => Number.isFinite(thesis.relevance?.[key])
    ? thesis.relevance[key] >= ART_ROUTING_THRESHOLD
    : fallback;
  const belowThreshold = (family) => {
    const score = Number.isFinite(thesis.relevance?.[family]) ? Number(thesis.relevance[family].toFixed(2)) : 0;
    return `${decisionFamilyLabel(family)} scored ${score} / 3, below the ${ART_ROUTING_THRESHOLD} routing threshold.`;
  };
  const hasMarks = thesis.fieldIntent === "MARKS" || thesis.fieldIntent === "GRADIENT_AND_MARKS";

  if (thesis.fieldIntent === "GRADIENT" || thesis.fieldIntent === "SOLID") {
    const structuralReason = `${thesis.fieldIntent} does not render mark layers.`;
    remove(layerKeys, structuralReason, "fieldIntent");
    remove(["paletteFamily", "paletteHarmony", "primaryColor", "secondaryColor", "accentColor", "lineCharacter", "shapeLanguage", "motion", "tempo", "rhythm", "turbulence", "edgeBehavior"], structuralReason, "fieldIntent");
  } else if (thesis.fieldIntent === "MARKS") {
    remove(["gradient", "gradientStartColor", "gradientEndColor", "gradientDirection"], "MARKS uses a flat field, so gradient controls are inactive.", "fieldIntent");
  }
  if (!relevant("palette")) remove(["paletteFamily", "paletteHarmony", "primaryColor", "secondaryColor", "accentColor", "saturation"], belowThreshold("palette"), "palette");
  if (!relevant("composition")) remove(["composition", "focalPoint"], belowThreshold("composition"), "composition");
  if (!relevant("space")) remove(["negativeSpace", "depth", "edgeBehavior"], belowThreshold("space"), "space");
  if (!relevant("motion", thesis.useMotion)) remove(["motion", "tempo", "rhythm"], belowThreshold("motion"), "motion");
  if (!relevant("texture", thesis.useTexture)) remove(["texture"], belowThreshold("texture"), "texture");
  if (!relevant("symmetry", thesis.useSymmetry)) remove(["symmetry"], belowThreshold("symmetry"), "symmetry");
  if (!relevant("atmosphere")) remove(["contrast", "atmosphere"], belowThreshold("atmosphere"), "atmosphere");
  if (!relevant("disorder")) remove(["turbulence"], belowThreshold("disorder"), "disorder");

  if (hasMarks) {
    if (!relevant("marks")) removeLayerProperties(["primitive", "distribution", "density", "scale", "fillMode", "strokeWidth"], belowThreshold("marks"), "marks");
    if (!relevant("palette")) removeLayerProperties(["colorRole"], belowThreshold("palette"), "palette");
    if (!relevant("atmosphere")) removeLayerProperties(["opacity", "blendMode"], belowThreshold("atmosphere"), "atmosphere");
    if (!relevant("texture") && !relevant("disorder")) removeLayerProperties(["noise"], `${belowThreshold("texture")} ${belowThreshold("disorder")}`, "texture+disorder");
    if (!relevant("composition") && !relevant("disorder")) removeLayerProperties(["rotation", "repetition", "scaleVariation"], `${belowThreshold("composition")} ${belowThreshold("disorder")}`, "composition+disorder");
  }
  return { questions, skipped };
}

function decisionFamilyLabel(value) {
  return String(value).replace(/\+/g, " and ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildRelevantArtQuestions(thesis) {
  return buildRelevantArtRouting(thesis).questions;
}

export function extractExplicitColors(prompt) {
  const names = Object.keys(COLOR_COMPANIONS);
  return [...new Set([...prompt.toUpperCase().matchAll(new RegExp(`\\b(${names.join("|")})\\b`, "g"))].map((match) => match[1]))];
}

function ensureRequestedMarkColors(spec, answers, namedColors, repairs) {
  if (!namedColors.length) return;
  const paletteKeys = ["primaryColor", "secondaryColor", "accentColor"];
  const roles = ["PRIMARY", "SECONDARY", "ACCENT"];
  namedColors.slice(0, paletteKeys.length).forEach((color, index) => {
    if (spec[paletteKeys[index]] !== color) {
      spec[paletteKeys[index]] = color;
      repairs.push(`${roles[index].toLowerCase()} palette slot preserves requested ${color.toLowerCase()}`);
    }
  });

  const requiredRoles = roles.slice(0, Math.min(namedColors.length, roles.length));
  for (const requiredRole of requiredRoles) {
    if (spec.layers.some((layer) => layer.colorRole === requiredRole)) continue;
    const counts = spec.layers.reduce((result, layer) => {
      result[layer.colorRole] = (result[layer.colorRole] ?? 0) + 1;
      return result;
    }, {});
    const candidates = spec.layers
      .map((layer, index) => ({
        index,
        duplicate: (counts[layer.colorRole] ?? 0) > 1,
        confidence: answerConfidence(answers[`layer${index + 1}_colorRole`]) ?? 0,
      }))
      .sort((a, b) => Number(b.duplicate) - Number(a.duplicate) || a.confidence - b.confidence);
    const candidate = candidates[0];
    spec.layers[candidate.index] = { ...spec.layers[candidate.index], colorRole: requiredRole };
    repairs.push(`layer ${candidate.index + 1} assigned requested ${requiredRole.toLowerCase()} color role`);
  }
}

function applySemanticAnchors(spec, thesis, namedColors, repairs) {
  if (!namedColors.length && COLOR_COMPANIONS[thesis.dominantColor]) {
    const anchor = thesis.dominantColor;
    const [secondary, accent] = COLOR_COMPANIONS[anchor];
    spec.primaryColor = anchor;
    spec.secondaryColor = secondary;
    spec.accentColor = accent;
    repairs.push(`palette anchored to Tier 1 dominant ${anchor.toLowerCase()}`);

    if (thesis.colorCoverage >= 1.35) {
      if (spec.fieldTreatment === "MARKS") {
        spec.fieldTreatment = "GRADIENT_AND_MARKS";
        repairs.push("high color coverage promoted marks to a full color field");
      }
      spec.gradientStartColor = anchor;
      spec.gradientEndColor = secondary;
      if (spec.gradient === "FLAT") spec.gradient = "RADIAL_GLOW";
    } else if (spec.fieldTreatment === "SOLID") {
      spec.gradientStartColor = anchor;
    }
  }

  if (thesis.formIntent === "GEOMETRIC") {
    spec.shapeLanguage = "GEOMETRIC";
    const geometricPrimitives = ["POLYGON", "CIRCLE", "ARC"];
    spec.layers = spec.layers.map((layer, index) => {
      if (geometricPrimitives.includes(layer.primitive)) return layer;
      repairs.push(`layer ${index + 1} primitive constrained to geometric form`);
      return { ...layer, primitive: geometricPrimitives[index % geometricPrimitives.length] };
    });
  }
}

function applyCompatibilityRepairs(spec, namedColors, repairs) {
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
}

export function repairCompleteArtSpec({ prompt, generatedSpec, seed }) {
  const spec = {
    ...generatedSpec,
    layers: generatedSpec.layers.map((layer) => ({ ...layer })),
    seed,
  };
  const repairs = [];
  const namedColors = extractExplicitColors(prompt);
  spec.requestedColors = namedColors;

  if (namedColors.length && spec.fieldTreatment !== "MARKS") {
    if (spec.gradientStartColor !== namedColors[0]) {
      spec.gradientStartColor = namedColors[0];
      repairs.push(`field preserves requested ${namedColors[0].toLowerCase()}`);
    }
    if (namedColors[1] && spec.gradientEndColor !== namedColors[1]) {
      spec.gradientEndColor = namedColors[1];
      repairs.push(`field preserves requested ${namedColors[1].toLowerCase()}`);
    }
  }
  if (spec.fieldTreatment === "MARKS" || spec.fieldTreatment === "GRADIENT_AND_MARKS") {
    ensureRequestedMarkColors(spec, {}, namedColors, repairs);
  }

  applyCompatibilityRepairs(spec, namedColors, repairs);
  return { spec, repairs };
}

function cloneSpec(spec) {
  return JSON.parse(JSON.stringify(spec));
}

function flattenSpec(value, prefix = "", result = {}) {
  if (Array.isArray(value) && prefix === "layers") {
    value.forEach((entry, index) => flattenSpec(entry, `layers[${index}]`, result));
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, entry]) => flattenSpec(entry, prefix ? `${prefix}.${key}` : key, result));
  } else if (prefix) {
    result[prefix] = value;
  }
  return result;
}

function answerIdForPath(path) {
  const layer = path.match(/^layers\[(\d+)]\.(.+)$/);
  return layer ? `layer${Number(layer[1]) + 1}_${layer[2]}` : path;
}

function initialProvenance(spec, answers) {
  return Object.fromEntries(Object.entries(flattenSpec(spec)).map(([path, value]) => {
    const answerId = answerIdForPath(path);
    const selectedByJev = Boolean(answers[answerId]);
    return [path, {
      path,
      value,
      source: selectedByJev ? "jev-tier2" : path === "seed" ? "prompt-seed" : "default",
      reason: selectedByJev
        ? `Selected by Jev as ${answerId}.`
        : path === "seed"
          ? "Deterministically derived from the prompt."
          : `The ${answerId} question was skipped, so the renderer default was used.`,
    }];
  }));
}

function recordChanges(before, after, provenance, source, reason) {
  const previous = flattenSpec(before);
  const next = flattenSpec(after);
  for (const [path, value] of Object.entries(next)) {
    if (JSON.stringify(previous[path]) === JSON.stringify(value)) continue;
    provenance[path] = { path, value, source, reason };
  }
}

function finalProvenance(spec, provenance) {
  return Object.entries(flattenSpec(spec)).map(([path, value]) => ({
    path,
    value,
    source: provenance[path]?.source ?? "default",
    reason: provenance[path]?.reason ?? "The renderer default was used.",
  }));
}

export function reconcileArtSpec({ prompt, thesis, answers, seed }) {
  const spec = artSpecFromAnswers(answers, seed);
  const omitted = [];
  const repairs = [];
  const provenance = initialProvenance(spec, answers);
  spec.fieldTreatment = thesis.fieldIntent;
  provenance.fieldTreatment = { path: "fieldTreatment", value: spec.fieldTreatment, source: "tier1", reason: `Mapped directly from Tier 1 fieldIntent ${thesis.fieldIntent}.` };
  if (!thesis.useMotion) {
    spec.motion = "STILL";
    provenance.motion = { path: "motion", value: "STILL", source: "relevance-fallback", reason: "Motion relevance was below the routing threshold." };
  }
  if (!thesis.useTexture) {
    spec.texture = "CLEAN";
    provenance.texture = { path: "texture", value: "CLEAN", source: "relevance-fallback", reason: "Texture relevance was below the routing threshold." };
  }
  if (!thesis.useSymmetry) {
    spec.symmetry = "NONE";
    provenance.symmetry = { path: "symmetry", value: "NONE", source: "relevance-fallback", reason: "Symmetry relevance was below the routing threshold." };
  }

  for (const [key, fallback] of Object.entries(OPTIONAL_DEFAULTS)) {
    if (answers[key] && !choiceIsReliable(answers[key])) {
      spec[key] = fallback;
      provenance[key] = { path: key, value: fallback, source: "confidence-fallback", reason: `${key} was answered with insufficient confidence, so its safe fallback was used.` };
      omitted.push(key);
    }
  }

  spec.layers = spec.layers.map((layer, index) => {
    const next = { ...layer };
    for (const [key, fallback] of Object.entries({ noise: "NONE", blendMode: "NORMAL", rotation: "ALIGNED" })) {
      const answerKey = `layer${index + 1}_${key}`;
      if (answers[answerKey] && !choiceIsReliable(answers[answerKey])) {
        next[key] = fallback;
        const path = `layers[${index}].${key}`;
        provenance[path] = { path, value: fallback, source: "confidence-fallback", reason: `${answerKey} was answered with insufficient confidence, so its safe fallback was used.` };
        omitted.push(answerKey);
      }
    }
    return next;
  });

  const namedColors = extractExplicitColors(prompt);
  spec.requestedColors = namedColors;
  provenance.requestedColors = { path: "requestedColors", value: namedColors, source: "literal-constraint", reason: namedColors.length ? "Extracted literal color names from the prompt." : "No literal color names were detected." };
  const beforeAnchors = cloneSpec(spec);
  const anchorRepairStart = repairs.length;
  applySemanticAnchors(spec, thesis, namedColors, repairs);
  recordChanges(beforeAnchors, spec, provenance, "semantic-anchor", repairs.slice(anchorRepairStart).join("; ") || "Tier 1 semantic anchors adjusted the renderer spec.");
  if (spec.fieldTreatment === "MARKS" || spec.fieldTreatment === "GRADIENT_AND_MARKS") {
    const beforeLiteralColors = cloneSpec(spec);
    const colorRepairStart = repairs.length;
    ensureRequestedMarkColors(spec, answers, namedColors, repairs);
    recordChanges(beforeLiteralColors, spec, provenance, "literal-constraint", repairs.slice(colorRepairStart).join("; ") || "Explicit prompt colors were preserved.");
    ["primaryColor", "secondaryColor", "accentColor"].slice(0, namedColors.length).forEach((path, index) => {
      provenance[path] = { path, value: spec[path], source: "literal-constraint", reason: `Preserved the explicitly requested ${namedColors[index]} color.` };
    });
  }
  const beforeCompatibility = cloneSpec(spec);
  const compatibilityRepairStart = repairs.length;
  applyCompatibilityRepairs(spec, namedColors, repairs);
  recordChanges(beforeCompatibility, spec, provenance, "compatibility-repair", repairs.slice(compatibilityRepairStart).join("; ") || "A renderer compatibility rule adjusted this value.");

  return { spec, omitted, repairs, provenance: finalProvenance(spec, provenance) };
}
