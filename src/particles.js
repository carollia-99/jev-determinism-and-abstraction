const SPEED = Object.freeze({ LOW: 0.55, MEDIUM: 1, HIGH: 1.65 });
const ENERGY = Object.freeze({ LOW: 0.55, MEDIUM: 1, HIGH: 1.6 });

function randomBetween(min, max, random) {
  return min + (max - min) * random();
}

export function createSeededRandom(seed = 1977) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createParticles(count, width, height, random = Math.random) {
  return Array.from({ length: count }, (_, id) => {
    const angle = randomBetween(0, Math.PI * 2, random);
    const velocity = randomBetween(0.18, 0.62, random);
    return {
      id,
      x: randomBetween(0, width, random),
      y: randomBetween(0, height, random),
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      size: randomBetween(0.7, 2.1, random),
      phase: randomBetween(0, Math.PI * 2, random),
    };
  });
}

function limitVelocity(particle, maximum) {
  const magnitude = Math.hypot(particle.vx, particle.vy);
  if (magnitude > maximum) {
    particle.vx = (particle.vx / magnitude) * maximum;
    particle.vy = (particle.vy / magnitude) * maximum;
  }
}

function wrap(value, boundary) {
  if (value < 0) return value + boundary;
  if (value >= boundary) return value - boundary;
  return value;
}

const motionForces = {
  DRIFT(particle, context) {
    const wave = Math.sin(context.time * 0.55 + particle.phase) * 0.003;
    particle.vx += Math.cos(particle.phase) * wave;
    particle.vy += Math.sin(particle.phase) * wave;
  },
  JITTER(particle, context) {
    const pulse = context.time * 18 + particle.id * 12.9898;
    particle.vx += Math.sin(pulse) * 0.105 * context.energy;
    particle.vy += Math.cos(pulse * 1.37) * 0.105 * context.energy;
  },
  ORBIT(particle, context) {
    const dx = context.width / 2 - particle.x;
    const dy = context.height / 2 - particle.y;
    const distance = Math.max(48, Math.hypot(dx, dy));
    const pull = 0.018 * context.energy;
    const spin = 0.029 * context.energy;
    particle.vx += (dx / distance) * pull - (dy / distance) * spin;
    particle.vy += (dy / distance) * pull + (dx / distance) * spin;
  },
  REPEL(particle, context) {
    const dx = particle.x - context.width / 2;
    const dy = particle.y - context.height / 2;
    const distance = Math.max(24, Math.hypot(dx, dy));
    const force = Math.min(0.16, 95 / (distance * distance)) * context.energy;
    particle.vx += (dx / distance) * force;
    particle.vy += (dy / distance) * force;
  },
};

export function stepParticles(particles, state, frame) {
  const speed = SPEED[state.speed];
  const energy = ENERGY[state.energy];
  const context = { ...frame, energy };
  const motion = motionForces[state.motion] ?? getSessionMotion(state.motion);
  if (!motion) throw new TypeError(`Unknown motion: ${state.motion}`);
  particles.forEach((particle) => {
    const previousVx = particle.vx;
    const previousVy = particle.vy;
    try {
      motion(particle, context);
    } catch {
      particle.vx = previousVx;
      particle.vy = previousVy;
      motionForces.DRIFT(particle, context);
    }
    if (!Number.isFinite(particle.vx) || !Number.isFinite(particle.vy)) {
      particle.vx = previousVx;
      particle.vy = previousVy;
    }
    const drag = state.motion === "JITTER" ? 0.91 : motionForces[state.motion] ? 0.992 : 0.985;
    particle.vx *= drag;
    particle.vy *= drag;
    limitVelocity(particle, state.motion === "ORBIT" || !motionForces[state.motion] ? 1.75 : 1.35);
    particle.x = wrap(particle.x + particle.vx * speed * frame.deltaScale, frame.width);
    particle.y = wrap(particle.y + particle.vy * speed * frame.deltaScale, frame.height);
  });
  return particles;
}
import { getSessionMotion } from "./capability-registry.js";

