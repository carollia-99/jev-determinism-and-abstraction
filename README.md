# Jev × canvas-sketch decision canvas

An expressive generative-art system in which one natural-language prompt becomes a visual thesis followed by only the relevant typed Jev decisions:

```text
natural-language prompt
  → Vercel AI Gateway
  → TypeSafe AI Jev
  → 8-question visual thesis (choice + score + boolean)
  → up to 80 relevant detail decisions
      28 global art directions
      13 choices × 4 visual layers when marks are relevant
  → confidence filtering + deterministic compatibility reconciliation
  → seeded ArtSpec JSON
  → fixed canvas-sketch renderer
  → animated artwork
```

Jev does not generate pixels or JavaScript. It selects a point in a deliberately expressive art grammar: literal gradient colors and direction, composition, palette, contrast, space, atmosphere, texture, motion, and four coordinated layers of mark-making. Explicit constraints are preserved before poetic interpretation, so “red yellow gradient” becomes literal `RED → YELLOW` Canvas color stops. The browser's fixed renderer turns that complete specification into deterministic Canvas 2D artwork.

The same prompt receives the same seed and layout. Motion stays live, but the composition remains stable. Low-confidence optional effects fall back to restrained defaults, irrelevant categories are never asked, and incompatible combinations such as lightening blends on white are repaired before rendering. A collapsible trace exposes the applied art specification, five representative decisions, and exact AI Gateway cost, tokens, and latency.

## Decision surface

- 28 global choices: composition, focal point, symmetry, negative space, depth, literal canvas/gradient/mark colors, gradient type and direction, field and frame treatment, color harmony, contrast, saturation, texture, line character, shape language, motion, tempo, rhythm, turbulence, edge behavior, and atmosphere.
- 52 layer choices: four layers each decide primitive, distribution, density, scale, scale variation, color role, fill, stroke, opacity, blend mode, rotation, noise, and repetition.
- Total: 8 thesis decisions plus a conditional subset of the 80-detail decision surface across two fast Jev calls.

Generated-JavaScript capabilities from the earlier motion-study milestone remain in the repository as an experiment, but they are no longer the main path. Because the normal art path executes only the fixed renderer, it does not require code generation or Vercel Sandbox.

> **Sandbox reminder:** the earlier generated-motion experiment still runs generated JavaScript locally after narrow static checks. Add Vercel Sandbox before treating that legacy path as production-safe.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add a Vercel AI Gateway key to `.env.local`:

```text
AI_GATEWAY_API_KEY=your_gateway_key_here
```

The key is read only by the local server middleware and the deployed Vercel Function. It is never included in the browser bundle. On Vercel, the function can use the platform-provided OIDC token instead.

## Verification

```bash
npm test
npm run build
```

Useful contrast prompts:

1. “A moonlit garden remembering a storm”
2. “Electric anxiety in a crowded city at midnight”
3. “Quiet geometry floating in a field of warm light”
4. “A vast heat haze over ancient red earth”

## Session receipts

Every successful composition returns a sanitized receipt containing the resolved model, wall-clock latency, input/output/total tokens, and actual cost from `providerMetadata.gateway.cost`. The UI keeps the latest prompt-level receipts and totals in memory. Raw provider metadata never reaches the browser.
