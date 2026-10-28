import canvasSketch from "canvas-sketch";
import { getArtSpec } from "./art-spec-state.js";

const DENSITY = { SPARSE: 18, MEDIUM: 52, DENSE: 120 };
const SCALE = { TINY: 2.5, SMALL: 7, MEDIUM: 18, LARGE: 42, MONUMENTAL: 92 };
const OPACITY = { FAINT: 0.18, SOFT: 0.42, SOLID: 0.82 };
const STROKE = { HAIRLINE: 0.65, THIN: 1.2, MEDIUM: 2.5, HEAVY: 5 };
const TEMPO = { GLACIAL: 0.08, SLOW: 0.18, MODERATE: 0.42, FAST: 0.9 };
const NOISE = { NONE: 0, LOW: 0.012, MEDIUM: 0.035, HIGH: 0.085 };
const BLEND = { NORMAL: "source-over", SCREEN: "screen", MULTIPLY: "multiply", LIGHTEN: "lighten" };

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function focalPoint(spec, width, height) {
  const points = {
    CENTER: [0.5, 0.5], UPPER_LEFT: [0.28, 0.28], UPPER_RIGHT: [0.72, 0.28],
    LOWER_LEFT: [0.28, 0.72], LOWER_RIGHT: [0.72, 0.72], DIFFUSE: [0.5, 0.5],
  };
  const [x, y] = points[spec.focalPoint];
  return [x * width, y * height];
}

export const ART_COLORS = Object.freeze({
  RED: "#ff2a1a",
  ORANGE: "#ff8a00",
  YELLOW: "#ffd900",
  LIME: "#a8e10c",
  GREEN: "#16b85c",
  TEAL: "#0aa68f",
  CYAN: "#00d9e8",
  BLUE: "#246bfe",
  INDIGO: "#3d35c9",
  VIOLET: "#8428e8",
  MAGENTA: "#e519b7",
  PINK: "#ff6fae",
  BROWN: "#85512c",
  BLACK: "#08090b",
  WHITE: "#ffffff",
  CREAM: "#f7f2e8",
  GRAY: "#858a91",
});

export function resolveArtColor(name) {
  return ART_COLORS[name] ?? ART_COLORS.BLACK;
}

function palette(spec) {
  if (spec.primaryColor && spec.secondaryColor && spec.accentColor) {
    return [
      resolveArtColor(spec.primaryColor),
      resolveArtColor(spec.secondaryColor),
      resolveArtColor(spec.accentColor),
      spec.background === "BLACK" ? ART_COLORS.WHITE : ART_COLORS.BLACK,
    ];
  }
  const base = { MONOCHROME: 210, WARM: 18, COOL: 205, EARTH: 35, NEON: 300, PASTEL: 185 }[spec.paletteFamily];
  const offsets = {
    ANALOGOUS: [0, 22, -24, 45], COMPLEMENTARY: [0, 180, 20, 200],
    TRIADIC: [0, 120, 240, 60], SPLIT: [0, 150, 210, 28],
  }[spec.paletteHarmony];
  const saturationBase = { MUTED: 34, NATURAL: 62, VIVID: 88 }[spec.saturation];
  const lightness = spec.background === "WHITE" || spec.background === "CREAM"
    ? { LOW: 32, MEDIUM: 24, HIGH: 16 }[spec.contrast]
    : { LOW: 70, MEDIUM: 76, HIGH: 84 }[spec.contrast];
  return offsets.map((offset, index) => `hsl(${(base + offset + 360) % 360} ${Math.min(96, saturationBase + index * 3)}% ${lightness + (index - 1) * 7}%)`);
}

export function drawBackground(context, width, height, spec) {
  const canvasColor = resolveArtColor(spec.background);
  const first = resolveArtColor(spec.gradientStartColor);
  const second = resolveArtColor(spec.gradientEndColor);
  const insetRatio = { FULL_BLEED: 0, INSET_SMALL: 0.03, INSET_WIDE: 0.09 }[spec.frameTreatment] ?? 0;
  const inset = Math.min(width, height) * insetRatio;
  const fieldWidth = width - inset * 2;
  const fieldHeight = height - inset * 2;
  context.fillStyle = canvasColor;
  context.fillRect(0, 0, width, height);
  if (spec.fieldTreatment === "MARKS") return;
  if (spec.fieldTreatment === "SOLID" || spec.gradient === "FLAT") {
    context.fillStyle = first;
    context.fillRect(inset, inset, fieldWidth, fieldHeight);
    return;
  }
  const [fx, fy] = focalPoint(spec, width, height);
  let gradient;
  if (spec.gradient === "LINEAR") {
    const directions = {
      LEFT_TO_RIGHT: [inset, height / 2, width - inset, height / 2],
      TOP_TO_BOTTOM: [width / 2, inset, width / 2, height - inset],
      DIAGONAL_DOWN: [inset, inset, width - inset, height - inset],
      DIAGONAL_UP: [inset, height - inset, width - inset, inset],
      CENTER_OUT: [inset, height / 2, width - inset, height / 2],
    };
    gradient = context.createLinearGradient(...directions[spec.gradientDirection]);
  } else {
    gradient = context.createRadialGradient(fx, fy, 0, fx, fy, Math.max(fieldWidth, fieldHeight) * 0.72);
  }
  if (spec.gradient === "VIGNETTE") {
    gradient.addColorStop(0, first);
    gradient.addColorStop(1, second);
  } else {
    gradient.addColorStop(0, first);
    gradient.addColorStop(1, second);
  }
  context.fillStyle = gradient;
  context.fillRect(inset, inset, fieldWidth, fieldHeight);
}

function basePosition(index, count, random, distribution, spec, width, height) {
  const margin = { MINIMAL: 0.01, BALANCED: 0.08, EXPANSIVE: 0.2 }[spec.negativeSpace];
  const [fx, fy] = focalPoint(spec, width, height);
  const usableW = width * (1 - margin * 2);
  const usableH = height * (1 - margin * 2);
  const t = count <= 1 ? 0.5 : index / (count - 1);
  let x = margin * width + random() * usableW;
  let y = margin * height + random() * usableH;

  if (distribution === "GRID") {
    const columns = Math.ceil(Math.sqrt(count * (width / height)));
    const rows = Math.ceil(count / columns);
    x = margin * width + ((index % columns) + 0.5) / columns * usableW;
    y = margin * height + (Math.floor(index / columns) + 0.5) / rows * usableH;
  } else if (distribution === "RING") {
    const angle = t * Math.PI * 2;
    const radius = Math.min(width, height) * (0.18 + random() * 0.24);
    x = fx + Math.cos(angle) * radius;
    y = fy + Math.sin(angle) * radius;
  } else if (distribution === "CLUSTER") {
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 1.8) * Math.min(width, height) * 0.34;
    x = fx + Math.cos(angle) * radius;
    y = fy + Math.sin(angle) * radius;
  } else if (distribution === "FLOW") {
    x = margin * width + t * usableW;
    y = fy + Math.sin(t * Math.PI * 3 + random() * 1.5) * usableH * 0.28;
  } else if (distribution === "EDGE") {
    const side = index % 4;
    if (side === 0) y = margin * height;
    if (side === 1) x = width - margin * width;
    if (side === 2) y = height - margin * height;
    if (side === 3) x = margin * width;
  }

  if (spec.composition === "HORIZON") y = height * 0.55 + (y - height * 0.5) * 0.32;
  if (spec.composition === "RADIAL" && distribution !== "RING") {
    const angle = t * Math.PI * 4 + random();
    const radius = Math.sqrt(t) * Math.min(width, height) * 0.46;
    x = fx + Math.cos(angle) * radius;
    y = fy + Math.sin(angle) * radius;
  }
  if (spec.composition === "GRID" && distribution === "UNIFORM") {
    x = Math.round(x / 36) * 36;
    y = Math.round(y / 36) * 36;
  }
  return [x, y];
}

function animatePoint(x, y, index, time, spec, width, height) {
  const speed = TEMPO[spec.tempo];
  const phase = index * 0.37;
  if (spec.motion === "DRIFT") {
    x += Math.sin(time * speed + phase) * width * 0.018;
    y += Math.cos(time * speed * 0.7 + phase) * height * 0.014;
  } else if (spec.motion === "WAVE") {
    y += Math.sin(time * speed * 2 + phase) * height * 0.025;
  } else if (spec.motion === "ORBIT") {
    const [fx, fy] = focalPoint(spec, width, height);
    const angle = time * speed * 0.08;
    const dx = x - fx;
    const dy = y - fy;
    x = fx + dx * Math.cos(angle) - dy * Math.sin(angle);
    y = fy + dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  return [x, y];
}

function mirroredPoints(x, y, spec, width, height) {
  if (spec.symmetry === "BILATERAL") return [[x, y], [width - x, y]];
  if (spec.symmetry === "RADIAL") return [[x, y], [width - x, y], [x, height - y], [width - x, height - y]];
  if (spec.symmetry === "ROTATIONAL") return [[x, y], [width - x, height - y]];
  return [[x, y]];
}

function rotationFor(layer, x, y, random, spec) {
  const [fx, fy] = focalPoint(spec, 1, 1);
  if (layer.rotation === "RADIAL") return Math.atan2(y - fy, x - fx);
  if (layer.rotation === "TANGENTIAL") return Math.atan2(y - fy, x - fx) + Math.PI / 2;
  if (layer.rotation === "RANDOM") return random() * Math.PI * 2;
  return spec.composition === "FLOW" ? -0.18 : 0;
}

function drawPrimitive(context, primitive, size, rotation, fillMode, index) {
  context.rotate(rotation);
  context.beginPath();
  if (primitive === "DOT") context.arc(0, 0, Math.max(0.7, size * 0.18), 0, Math.PI * 2);
  if (primitive === "CIRCLE") context.arc(0, 0, size * 0.5, 0, Math.PI * 2);
  if (primitive === "ARC") context.arc(0, 0, size * 0.65, -Math.PI * 0.7, Math.PI * 0.55);
  if (primitive === "LINE") { context.moveTo(-size, 0); context.lineTo(size, 0); }
  if (primitive === "POLYGON") {
    const sides = 3 + (index % 4);
    for (let side = 0; side < sides; side += 1) {
      const angle = side / sides * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * size * 0.55;
      const py = Math.sin(angle) * size * 0.55;
      if (side === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
  }
  if (primitive === "RIBBON") {
    context.moveTo(-size, 0);
    context.bezierCurveTo(-size * 0.35, -size * 0.45, size * 0.25, size * 0.45, size, 0);
  }
  const filled = fillMode === "FILLED" || fillMode === "TRANSLUCENT" || (fillMode === "MIXED" && index % 2 === 0);
  if (filled && !["LINE", "ARC", "RIBBON"].includes(primitive)) context.fill();
  else context.stroke();
}

function drawLayer(context, width, height, time, spec, layer, layerIndex, colors) {
  const random = createRandom(spec.seed + layerIndex * 100003);
  const count = Math.round(DENSITY[layer.density] * (spec.negativeSpace === "EXPANSIVE" ? 0.7 : 1));
  const colorIndex = { PRIMARY: 0, SECONDARY: 1, ACCENT: 2, NEUTRAL: 3 }[layer.colorRole];
  const turbulence = { NONE: 0, GENTLE: 0.35, ACTIVE: 0.8, CHAOTIC: 1.5 }[spec.turbulence];
  const depthScale = spec.depth === "FLAT" ? 1 : 0.72 + layerIndex * 0.16;

  context.save();
  context.globalCompositeOperation = BLEND[layer.blendMode];
  context.lineCap = spec.lineCharacter === "PRECISE" ? "square" : "round";
  context.setLineDash(spec.lineCharacter === "BROKEN" ? [4, 7] : []);
  if (spec.atmosphere === "SUBLIME" || spec.atmosphere === "MYSTERIOUS") {
    context.shadowColor = colors[colorIndex];
    context.shadowBlur = spec.atmosphere === "SUBLIME" ? 12 : 5;
  }

  for (let index = 0; index < count; index += 1) {
    let [x, y] = basePosition(index, count, random, layer.distribution, spec, width, height);
    const distortion = (NOISE[layer.noise] + turbulence * 0.012) * Math.min(width, height);
    x += (random() - 0.5) * distortion;
    y += (random() - 0.5) * distortion;
    [x, y] = animatePoint(x, y, index + layerIndex * 17, time, spec, width, height);
    const variation = layer.scaleVariation === "UNIFORM" ? 1 : layer.scaleVariation === "SUBTLE" ? 0.75 + random() * 0.5 : 0.35 + random() * 1.5;
    const progression = layer.repetition === "PROGRESSIVE" ? 0.5 + index / count : 1;
    const pulse = spec.motion === "PULSE" ? 0.82 + Math.sin(time * TEMPO[spec.tempo] * 2 + index * 0.2) * 0.18 : 1;
    const size = SCALE[layer.scale] * variation * progression * pulse * depthScale;
    const opacity = OPACITY[layer.opacity] * (layer.fillMode === "TRANSLUCENT" ? 0.62 : 1) * (spec.depth === "ATMOSPHERIC" ? 0.7 + layerIndex * 0.08 : 1);

    for (const [drawX, drawY] of mirroredPoints(x, y, spec, width, height)) {
      context.save();
      context.translate(drawX, drawY);
      context.globalAlpha = opacity;
      context.fillStyle = colors[colorIndex];
      context.strokeStyle = colors[colorIndex];
      context.lineWidth = STROKE[layer.strokeWidth];
      drawPrimitive(context, layer.primitive, size, rotationFor(layer, drawX / width, drawY / height, random, spec), layer.fillMode, index);
      context.restore();
    }
  }
  context.restore();
}

function drawTexture(context, width, height, spec) {
  if (spec.texture === "CLEAN") return;
  const random = createRandom(spec.seed ^ 0x9e3779b9);
  context.save();
  context.globalCompositeOperation = spec.background === "CREAM" || spec.background === "WHITE" ? "multiply" : "screen";
  context.globalAlpha = spec.texture === "MIST" ? 0.025 : 0.055;
  context.fillStyle = spec.background === "CREAM" || spec.background === "WHITE" ? "#4a4038" : "#ffffff";
  const count = spec.texture === "GRAIN" ? 900 : 260;
  for (let index = 0; index < count; index += 1) {
    const x = random() * width;
    const y = random() * height;
    if (spec.texture === "SCRATCH") context.fillRect(x, y, 8 + random() * 24, 0.5);
    else context.fillRect(x, y, 0.6 + random() * 1.3, 0.6 + random() * 1.3);
  }
  context.restore();
}

export function renderGenerativeArt(context, width, height, time, spec) {
  drawBackground(context, width, height, spec);
  const colors = palette(spec);
  const hasMarks = spec.fieldTreatment === "MARKS" || spec.fieldTreatment === "GRADIENT_AND_MARKS";
  if (hasMarks) {
    spec.layers.forEach((layer, index) => drawLayer(context, width, height, time, spec, layer, index, colors));
    drawTexture(context, width, height, spec);
  }
  if (hasMarks && spec.edgeBehavior === "BORDERED") {
    context.strokeStyle = colors[2];
    context.globalAlpha = 0.5;
    context.lineWidth = 1;
    context.strokeRect(14, 14, width - 28, height - 28);
    context.globalAlpha = 1;
  }
}

export function mountGenerativeRenderer(container) {
  return canvasSketch(
    () => ({
      render({ context, width, height, time }) {
        renderGenerativeArt(context, width, height, time, getArtSpec());
      },
    }),
    {
      animate: true,
      hotkeys: false,
      parent: container,
      resizeCanvas: true,
      attributes: { alpha: false },
    },
  );
}
