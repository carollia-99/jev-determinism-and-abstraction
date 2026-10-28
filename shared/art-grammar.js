const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });

const COLOR_CHOICES = Object.freeze({
  RED: "Literal red.",
  ORANGE: "Literal orange.",
  YELLOW: "Literal yellow.",
  LIME: "Yellow-green lime.",
  GREEN: "Literal green.",
  TEAL: "Blue-green teal.",
  CYAN: "Literal cyan.",
  BLUE: "Literal blue.",
  INDIGO: "Deep blue-violet indigo.",
  VIOLET: "Literal violet.",
  MAGENTA: "Literal magenta.",
  PINK: "Literal pink.",
  BROWN: "Earthy brown.",
  BLACK: "Near-black ink.",
  WHITE: "Clean white.",
  CREAM: "Warm off-white cream.",
  GRAY: "Neutral gray.",
});

export const GLOBAL_ART_QUESTIONS = Object.freeze({
  composition: choice("Choose the dominant compositional system for the requested artwork.", {
    RADIAL: "Forms radiate around a focal center.",
    GRID: "Forms follow an ordered modular grid.",
    FLOW: "Forms travel along a directional current or field.",
    SCATTER: "Forms are dispersed with intentional irregularity.",
    HORIZON: "Forms organize around a horizontal divide or landscape-like band.",
    CLUSTER: "Forms gather into one or more concentrated masses.",
  }),
  focalPoint: choice("Choose where visual attention should concentrate.", {
    CENTER: "Centered and balanced.",
    UPPER_LEFT: "Weighted toward the upper left.",
    UPPER_RIGHT: "Weighted toward the upper right.",
    LOWER_LEFT: "Weighted toward the lower left.",
    LOWER_RIGHT: "Weighted toward the lower right.",
    DIFFUSE: "No single focal point; attention moves across the field.",
  }),
  symmetry: choice("Choose the artwork's structural symmetry.", {
    NONE: "Asymmetric and freely balanced.",
    BILATERAL: "Mirrored across a vertical axis.",
    RADIAL: "Repeated around a central point.",
    ROTATIONAL: "Echoed through partial rotations.",
  }),
  negativeSpace: choice("Choose how much quiet empty space the composition needs.", {
    MINIMAL: "Nearly edge-to-edge activity.",
    BALANCED: "Active and quiet regions share the frame.",
    EXPANSIVE: "Large calm regions isolate the marks.",
  }),
  depth: choice("Choose the perceived spatial depth.", {
    FLAT: "Graphic, poster-like, and planar.",
    LAYERED: "Clearly overlapping near and far layers.",
    ATMOSPHERIC: "Depth emerges through fading, scale, and haze.",
  }),
  background: choice("Choose the literal outer canvas or margin color. Honor explicitly named colors; otherwise infer an appropriate neutral.", COLOR_CHOICES),
  gradient: choice("Choose the background light behavior.", {
    FLAT: "One uninterrupted color field.",
    RADIAL_GLOW: "Light blooms around the focal point.",
    LINEAR: "Light shifts directionally across the frame.",
    VIGNETTE: "Edges darken around a brighter interior.",
  }),
  fieldTreatment: choice("Choose whether the artwork is primarily a gradient field, marks, or both. An explicit gradient request should preserve it as the dominant field.", {
    GRADIENT: "A clean gradient field with no overlaid marks.",
    GRADIENT_AND_MARKS: "A gradient field with coordinated generative marks.",
    MARKS: "Generative marks on a flat field.",
    SOLID: "A minimal uninterrupted solid-color field.",
  }),
  frameTreatment: choice("Choose how the color field meets the canvas edge.", {
    FULL_BLEED: "Color reaches every edge.",
    INSET_SMALL: "A narrow visible canvas margin frames the field.",
    INSET_WIDE: "A generous gallery-like canvas margin frames the field.",
  }),
  gradientStartColor: choice("Choose the literal first gradient color. If colors are named in the prompt, use the first named color here.", COLOR_CHOICES),
  gradientEndColor: choice("Choose the literal final gradient color. If two or more colors are named in the prompt, use the second named color here.", COLOR_CHOICES),
  gradientDirection: choice("Choose the direction of the gradient's color travel.", {
    LEFT_TO_RIGHT: "First color at left, final color at right.",
    TOP_TO_BOTTOM: "First color at top, final color at bottom.",
    DIAGONAL_DOWN: "First color at upper-left, final color at lower-right.",
    DIAGONAL_UP: "First color at lower-left, final color at upper-right.",
    CENTER_OUT: "First color at the center, final color at the edges.",
  }),
  paletteFamily: choice("Choose the dominant color family.", {
    MONOCHROME: "One hue expressed through lightness.",
    WARM: "Reds, oranges, golds, and warm neutrals.",
    COOL: "Blues, cyans, violets, and cool neutrals.",
    EARTH: "Ochres, clay, moss, stone, and soil.",
    NEON: "Electric synthetic high-chroma colors.",
    PASTEL: "Soft luminous low-contrast colors.",
  }),
  paletteHarmony: choice("Choose how the palette hues relate.", {
    ANALOGOUS: "Neighboring hues create continuity.",
    COMPLEMENTARY: "Opposing hues create tension.",
    TRIADIC: "Three separated hues create lively balance.",
    SPLIT: "One hue contrasts with two near-opposites.",
  }),
  primaryColor: choice("Choose the literal primary mark color. Honor an explicitly requested dominant color.", COLOR_CHOICES),
  secondaryColor: choice("Choose the literal secondary mark color. Honor the second explicitly requested color when appropriate.", COLOR_CHOICES),
  accentColor: choice("Choose the literal accent mark color.", COLOR_CHOICES),
  contrast: choice("Choose the tonal contrast.", {
    LOW: "Soft transitions and restrained separation.",
    MEDIUM: "Readable separation without harshness.",
    HIGH: "Graphic, dramatic light-dark separation.",
  }),
  saturation: choice("Choose overall chroma intensity.", {
    MUTED: "Dusty, restrained, and desaturated.",
    NATURAL: "Moderate, believable saturation.",
    VIVID: "Bold and highly saturated.",
  }),
  texture: choice("Choose the surface texture.", {
    CLEAN: "Crisp digital surface.",
    GRAIN: "Fine print-like grain.",
    MIST: "Soft translucent atmospheric veil.",
    SCRATCH: "Dry, etched, tactile interruptions.",
  }),
  lineCharacter: choice("Choose the character of lines and contours.", {
    PRECISE: "Geometric and controlled.",
    DELICATE: "Thin, light, and careful.",
    BOLD: "Heavy and declarative.",
    BROKEN: "Dashed, interrupted, and fragmentary.",
  }),
  shapeLanguage: choice("Choose the broad shape language.", {
    GEOMETRIC: "Hard-edged constructed forms.",
    ORGANIC: "Soft irregular biological forms.",
    CELESTIAL: "Orbital, stellar, and cosmic forms.",
    ARCHITECTURAL: "Frames, columns, planes, and structural rhythm.",
  }),
  motion: choice("Choose how the artwork should move, even if only subtly.", {
    STILL: "Essentially static with only atmospheric shimmer.",
    DRIFT: "Slow continuous translation.",
    PULSE: "Rhythmic expansion and contraction.",
    ORBIT: "Rotation around a focal point.",
    WAVE: "Coordinated oscillating movement.",
  }),
  tempo: choice("Choose the temporal pace.", {
    GLACIAL: "Very slow and contemplative.",
    SLOW: "Calm visible movement.",
    MODERATE: "Balanced motion speed.",
    FAST: "Urgent energetic motion.",
  }),
  rhythm: choice("Choose how repetition is paced.", {
    EVEN: "Regular, stable intervals.",
    SYNCOPATED: "Alternating accents and interruptions.",
    CASCADE: "Progressive waves across the field.",
    BREATHING: "Slow expansion and release.",
  }),
  turbulence: choice("Choose how much the system departs from order.", {
    NONE: "Nearly exact structure.",
    GENTLE: "Small organic deviations.",
    ACTIVE: "Visible distortion and lively variation.",
    CHAOTIC: "Strong irregularity and instability.",
  }),
  edgeBehavior: choice("Choose how marks relate to the frame.", {
    CONTAINED: "Marks remain comfortably inside the canvas.",
    CROPPED: "Marks confidently cross the frame.",
    FADED: "Marks dissolve as they approach edges.",
    BORDERED: "The frame itself becomes structural.",
  }),
  atmosphere: choice("Choose the emotional atmosphere of the final image.", {
    SERENE: "Quiet, spacious, and meditative.",
    TENSE: "Compressed, sharp, and uneasy.",
    JOYFUL: "Buoyant, bright, and playful.",
    MELANCHOLIC: "Reflective, distant, and subdued.",
    MYSTERIOUS: "Obscured, nocturnal, and suggestive.",
    SUBLIME: "Vast, luminous, and awe-inducing.",
  }),
});

export const LAYER_ART_QUESTIONS = Object.freeze({
  primitive: choice("Choose the primary mark type for this layer.", {
    DOT: "Points, specks, particles, and stars.",
    LINE: "Straight directional strokes.",
    CIRCLE: "Discs, rings, and bubbles.",
    ARC: "Curved partial circles and gestures.",
    POLYGON: "Angular closed forms.",
    RIBBON: "Elongated flowing bands.",
  }),
  distribution: choice("Choose how marks are spatially distributed.", {
    UNIFORM: "Evenly dispersed across the frame.",
    CLUSTER: "Gathered around the global focal point.",
    FLOW: "Aligned along a directional current.",
    RING: "Arranged around a central radius.",
    GRID: "Placed in ordered rows and columns.",
    EDGE: "Concentrated near the frame boundaries.",
  }),
  density: choice("Choose the number of marks in this layer.", {
    SPARSE: "A few isolated marks.",
    MEDIUM: "A readable field of marks.",
    DENSE: "Many overlapping marks.",
  }),
  scale: choice("Choose the typical mark scale.", {
    TINY: "Minute details.",
    SMALL: "Small supporting forms.",
    MEDIUM: "Clearly legible mid-size forms.",
    LARGE: "Dominant oversized forms.",
    MONUMENTAL: "Very large cropped forms.",
  }),
  scaleVariation: choice("Choose variation in mark scale.", {
    UNIFORM: "Nearly identical sizes.",
    SUBTLE: "Small controlled differences.",
    WIDE: "Dramatically mixed sizes.",
  }),
  colorRole: choice("Choose this layer's role in the palette.", {
    PRIMARY: "Dominant palette color.",
    SECONDARY: "Supporting adjacent color.",
    ACCENT: "Contrasting high-attention color.",
    NEUTRAL: "Tonal neutral or background-relative color.",
  }),
  fillMode: choice("Choose how marks are painted.", {
    FILLED: "Solid interior color.",
    OUTLINE: "Contour only.",
    TRANSLUCENT: "Soft transparent fill.",
    MIXED: "Alternate filled and outlined marks.",
  }),
  strokeWidth: choice("Choose contour weight.", {
    HAIRLINE: "Extremely fine line.",
    THIN: "Light visible line.",
    MEDIUM: "Balanced line weight.",
    HEAVY: "Strong graphic contour.",
  }),
  opacity: choice("Choose this layer's opacity.", {
    FAINT: "Barely present atmospheric marks.",
    SOFT: "Translucent supporting marks.",
    SOLID: "Mostly opaque marks.",
  }),
  blendMode: choice("Choose how this layer combines with layers beneath it.", {
    NORMAL: "Standard paint-over compositing.",
    SCREEN: "Light-adding luminous overlap.",
    MULTIPLY: "Pigment-like darkening overlap.",
    LIGHTEN: "Retain lighter intersecting colors.",
  }),
  rotation: choice("Choose mark orientation behavior.", {
    ALIGNED: "Consistent shared direction.",
    RADIAL: "Oriented around the focal point.",
    TANGENTIAL: "Oriented along circular flow.",
    RANDOM: "Varied independent angles.",
  }),
  noise: choice("Choose positional distortion for this layer.", {
    NONE: "Exact placement.",
    LOW: "Small hand-like deviation.",
    MEDIUM: "Visible organic displacement.",
    HIGH: "Strong turbulent displacement.",
  }),
  repetition: choice("Choose repetition cadence within this layer.", {
    CONSTANT: "Stable repeated motif.",
    ALTERNATING: "Two-beat variation.",
    PROGRESSIVE: "Gradual change across marks.",
    IRREGULAR: "Unpredictable but bounded variation.",
  }),
});

export const ART_LAYER_COUNT = 4;
export const ART_DECISION_COUNT =
  Object.keys(GLOBAL_ART_QUESTIONS).length + Object.keys(LAYER_ART_QUESTIONS).length * ART_LAYER_COUNT;

export function buildArtQuestions() {
  const questions = { ...GLOBAL_ART_QUESTIONS };
  const roles = ["foundation", "structure", "accent", "detail"];
  for (let index = 0; index < ART_LAYER_COUNT; index += 1) {
    for (const [key, question] of Object.entries(LAYER_ART_QUESTIONS)) {
      questions[`layer${index + 1}_${key}`] = {
        ...question,
        instructions: `${question.instructions} This is the ${roles[index]} layer; coordinate it with the user's overall request.`,
      };
    }
  }
  return questions;
}

export function artSpecFromAnswers(answers, seed) {
  const defaults = createDefaultArtSpec();
  const globals = Object.fromEntries(
    Object.keys(GLOBAL_ART_QUESTIONS).map((key) => [key, answers[key]?.choice ?? defaults[key]]),
  );
  const layers = Array.from({ length: ART_LAYER_COUNT }, (_, index) =>
    Object.fromEntries(
      Object.keys(LAYER_ART_QUESTIONS).map((key) => [
        key,
        answers[`layer${index + 1}_${key}`]?.choice ?? defaults.layers[index][key],
      ]),
    ),
  );
  return { ...globals, layers, seed };
}

export function createDefaultArtSpec() {
  return {
    composition: "FLOW",
    focalPoint: "CENTER",
    symmetry: "NONE",
    negativeSpace: "BALANCED",
    depth: "LAYERED",
    background: "BLACK",
    gradient: "RADIAL_GLOW",
    fieldTreatment: "GRADIENT_AND_MARKS",
    frameTreatment: "FULL_BLEED",
    gradientStartColor: "INDIGO",
    gradientEndColor: "BLACK",
    gradientDirection: "CENTER_OUT",
    paletteFamily: "COOL",
    paletteHarmony: "ANALOGOUS",
    primaryColor: "CYAN",
    secondaryColor: "BLUE",
    accentColor: "VIOLET",
    contrast: "MEDIUM",
    saturation: "NATURAL",
    texture: "GRAIN",
    lineCharacter: "DELICATE",
    shapeLanguage: "ORGANIC",
    motion: "DRIFT",
    tempo: "SLOW",
    rhythm: "BREATHING",
    turbulence: "GENTLE",
    edgeBehavior: "CROPPED",
    atmosphere: "MYSTERIOUS",
    seed: 1977,
    layers: [
      { primitive: "RIBBON", distribution: "FLOW", density: "SPARSE", scale: "LARGE", scaleVariation: "WIDE", colorRole: "PRIMARY", fillMode: "TRANSLUCENT", strokeWidth: "THIN", opacity: "SOFT", blendMode: "SCREEN", rotation: "ALIGNED", noise: "LOW", repetition: "PROGRESSIVE" },
      { primitive: "ARC", distribution: "RING", density: "MEDIUM", scale: "MEDIUM", scaleVariation: "SUBTLE", colorRole: "SECONDARY", fillMode: "OUTLINE", strokeWidth: "HAIRLINE", opacity: "SOFT", blendMode: "SCREEN", rotation: "TANGENTIAL", noise: "LOW", repetition: "ALTERNATING" },
      { primitive: "CIRCLE", distribution: "CLUSTER", density: "SPARSE", scale: "SMALL", scaleVariation: "WIDE", colorRole: "ACCENT", fillMode: "TRANSLUCENT", strokeWidth: "THIN", opacity: "SOLID", blendMode: "LIGHTEN", rotation: "RANDOM", noise: "MEDIUM", repetition: "IRREGULAR" },
      { primitive: "DOT", distribution: "UNIFORM", density: "DENSE", scale: "TINY", scaleVariation: "SUBTLE", colorRole: "NEUTRAL", fillMode: "FILLED", strokeWidth: "HAIRLINE", opacity: "FAINT", blendMode: "SCREEN", rotation: "RANDOM", noise: "HIGH", repetition: "IRREGULAR" },
    ],
  };
}
