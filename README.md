# Jev × canvas-sketch decision canvas

An expressive generative-art system in which one natural-language prompt becomes a visual thesis followed by only the relevant typed Jev decisions:

```text
natural-language prompt
  → Vercel AI Gateway
  → TypeSafe AI Jev
  → 17-question visual thesis and relevance router (choice + score)
  → optional confidence clarification for uncertain color, coverage, form, or field intent
  → up to 80 relevant detail decisions
      28 global art directions
      13 choices × 4 visual layers when marks are relevant
  → confidence filtering + deterministic compatibility reconciliation
  → seeded ArtSpec JSON
  → fixed canvas-sketch renderer
  → animated artwork
```

Jev does not generate pixels or JavaScript. It selects a point in a deliberately expressive art grammar: literal gradient colors and direction, composition, palette, contrast, space, atmosphere, texture, motion, and four coordinated layers of mark-making. Explicit constraints are preserved before poetic interpretation, so “red yellow gradient” becomes literal `RED → YELLOW` Canvas color stops. The browser's fixed renderer turns that complete specification into deterministic Canvas 2D artwork.

The prompt UI also has a **Full ArtSpec model** comparison path. “Full ArtSpec” means that one conventional language-model call fills every one of the renderer's 80 typed fields in a single schema-validated response; the model still does not generate pixels or executable JavaScript. The picker can route that call through AI Gateway to Claude Haiku 4.5, Claude Sonnet 4.6, GPT-5.4 Mini, or GPT-5.4. Both paths use the same literal-color and compatibility repair pass, prompt-derived seed, state update, and fixed renderer, so their latency, token use, cost, and artwork can be compared without changing the rendering system. This first comparison milestone has no fallback or automatic routing.

The same prompt receives the same seed and layout. Motion stays live, but the composition remains stable. Low-confidence optional effects fall back to restrained defaults, irrelevant categories are never asked, and incompatible combinations such as lightening blends on white are repaired before rendering. A decision debugger exposes literal constraints, every Tier 1 answer, the routing handoff, every Tier 2 answer and probability distribution, compiler overrides, the final ArtSpec, and exact AI Gateway cost, tokens, and latency. Its default exception view emphasizes low-confidence and repaired decisions; the full view remains available on demand.

## Decision surface

- 28 global choices: composition, focal point, symmetry, negative space, depth, literal canvas/gradient/mark colors, gradient type and direction, field and frame treatment, color harmony, contrast, saturation, texture, line character, shape language, motion, tempo, rhythm, turbulence, edge behavior, and atmosphere.
- 52 layer choices: four layers each decide primitive, distribution, density, scale, scale variation, color role, fill, stroke, opacity, blend mode, rotation, noise, and repetition.
- 9 relevance scores route palette, composition, marks, space, motion, texture, symmetry, atmosphere, and disorder into only the useful detail families. Literal named colors automatically make palette decisions essential.
- Total: 17 thesis, semantic-anchor, and characteristic-relevance decisions plus a conditional subset of the 80-detail decision surface. Most prompts use two fast Jev calls; prompts with low-confidence core routing receive one small targeted clarification call before details.

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
# Optional server default; the UI picker overrides it per request
COMPARISON_MODEL=anthropic/claude-sonnet-4.6
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

Every successful composition returns a sanitized receipt containing the resolved model, wall-clock latency, input/output/total tokens, and actual cost from `providerMetadata.gateway.cost`. Each prompt receipt shows its route or selected model plus total calls, elapsed Gateway time, and cost; the session header aggregates the same measurements across all Jev and comparison-model calls. Raw provider metadata never reaches the browser.
