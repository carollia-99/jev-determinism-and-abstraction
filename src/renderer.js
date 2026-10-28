import canvasSketch from "canvas-sketch";
import { getArtState } from "./art-state.js";
import { createParticles, createSeededRandom, stepParticles } from "./particles.js";

const PARTICLE_COUNT = 300;

function drawBackground(context, width, height) {
  context.fillStyle = "#090a0c";
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(
    width * 0.5,
    height * 0.48,
    0,
    width * 0.5,
    height * 0.48,
    Math.max(width, height) * 0.58,
  );
  glow.addColorStop(0, "rgba(214, 255, 104, 0.055)");
  glow.addColorStop(1, "rgba(9, 10, 12, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawParticles(context, particles) {
  context.fillStyle = "rgba(238, 241, 229, 0.88)";
  context.beginPath();
  particles.forEach((particle) => {
    context.moveTo(particle.x + particle.size, particle.y);
    context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
  });
  context.fill();
}

export function mountParticleRenderer(container) {
  const settings = {
    animate: true,
    // canvas-sketch binds Space to play/pause by default. Disable its global
    // shortcuts so typing a natural-language prompt cannot freeze the artwork.
    hotkeys: false,
    parent: container,
    resizeCanvas: true,
    dimensions: [container.clientWidth, container.clientHeight],
    attributes: { alpha: false },
  };
  let particles = [];
  return canvasSketch(
    ({ width, height }) => {
      particles = createParticles(PARTICLE_COUNT, width, height, createSeededRandom());
      return {
        resize({ width: nextWidth, height: nextHeight, pixelRatio }) {
          if (particles.length === 0) return;
          particles.forEach((particle) => {
            particle.x = Math.min(particle.x, nextWidth * pixelRatio);
            particle.y = Math.min(particle.y, nextHeight * pixelRatio);
          });
        },
        render({ context, width, height, time, deltaTime }) {
          stepParticles(particles, getArtState(), {
            width,
            height,
            time,
            deltaScale: Math.min(2, deltaTime * 60 || 1),
          });
          drawBackground(context, width, height);
          drawParticles(context, particles);
        },
      };
    },
    settings,
  );
}
