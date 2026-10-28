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

The **Populate spec** picker puts Jev alongside Claude Haiku 4.5, Claude Sonnet 4.6, GPT-5.4 Mini, and GPT-5.4. Jev asks only relevant typed questions; each conventional model fills all 80 renderer fields in one schema-validated response. None of these options generates pixels or executable JavaScript. They share the same literal-color and compatibility repair pass, prompt-derived seed, state update, and fixed renderer, so latency, token use, cost, and artwork can be compared without changing the rendering system.

The separate **Custom code + Sandbox** path deliberately crosses that boundary. Claude Sonnet 4.6 is fixed as the code-authoring model and writes a complete, prompt-specific Canvas 2D JavaScript program rather than selecting an ArtSpec. The server rejects imports, network and storage APIs, parent-window access, and dynamic evaluation; Vercel Sandbox then syntax-checks and smoke-executes the program in a network-isolated microVM. A time-limited static server exposes the validated artwork to a browser iframe that allows scripts but not same-origin access. The session receipt records the Sonnet generation call; Sandbox execution time is surfaced in the completion status.

The same prompt receives the same seed and layout. Motion stays live, but the composition remains stable. Low-confidence optional effects fall back to restrained defaults, irrelevant categories are never asked, and incompatible combinations such as lightening blends on white are repaired before rendering. The compact decision trace shows the resulting visual choices, while the session receipt exposes exact AI Gateway cost, tokens, and latency.

## Decision surface

- 28 global choices: composition, focal point, symmetry, negative space, depth, literal canvas/gradient/mark colors, gradient type and direction, field and frame treatment, color harmony, contrast, saturation, texture, line character, shape language, motion, tempo, rhythm, turbulence, edge behavior, and atmosphere.
- 52 layer choices: four layers each decide primitive, distribution, density, scale, scale variation, color role, fill, stroke, opacity, blend mode, rotation, noise, and repetition.
- 9 relevance scores route palette, composition, marks, space, motion, texture, symmetry, atmosphere, and disorder into only the useful detail families. Literal named colors automatically make palette decisions essential.
- Total: 17 thesis, semantic-anchor, and characteristic-relevance decisions plus a conditional subset of the 80-detail decision surface. Most prompts use two fast Jev calls; prompts with low-confidence core routing receive one small targeted clarification call before details.

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

For local Sandbox previews, link the project and pull its Vercel environment so the SDK receives an OIDC token:

```bash
vercel link
vercel env pull
```

The other two routes continue to work without local Sandbox credentials.

## Verification

```bash
npm test
npm run build
```

Useful contrast prompts:

1. “green blue gradient”
2. “a heat haze in the desert”
3. “geometric shapes in bright day”
4. “midnight anxiety”

## Session receipts

Every successful composition returns a sanitized receipt containing the resolved model, wall-clock latency, input/output/total tokens, and actual cost from `providerMetadata.gateway.cost`. Each prompt receipt shows its route or selected model plus total calls, elapsed time, and cost; the session header aggregates the same measurements across Jev, full-ArtSpec, code-generation, and Sandbox stages. Raw provider metadata never reaches the browser.
