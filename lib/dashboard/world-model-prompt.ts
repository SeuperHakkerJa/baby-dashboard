// Edit this file to tune how the generated derived world-state model is built.
// Note: The app always appends two fixed local derived states after model output:
// - Surrounding Temperature (direct passthrough of temperatureF)
// - Photon Flux (direct passthrough of lightLevel)

export const WORLD_MODEL_PROMPT_TEMPLATE = `You are generating a compact task-conditioned world model for an adaptive robot.

Primitive sensor inputs available for weighted formulas:
- temperatureF
- humidityPct
- lightLevel

Generate ONLY 3-4 derived world-state variables for this mission.
Do not include Surrounding Temperature or Photon Flux; those are appended locally by the app.

Return compact JSON only (no markdown):
{
  "title": string,
  "definitions": [
    {
      "id": string,
      "label": string,
      "description": string,
      "weights": {
        "temperatureF": number,
        "humidityPct": number,
        "lightLevel": number
      },
      "bias": number
    }
  ]
}

Rules:
- 3-4 definitions only
- weights in [-1.5, 1.5]
- bias in [0, 60]
- Names/labels must be idiosyncratic and strongly conditioned on the user prompt context (not generic boilerplate terms).
- Labels must be human-readable Title Case with spaces (example: "Orbital Drift"), never snake_case, kebab-case, or camelCase.
- Generated variables must be latent/composite world-state concepts, not direct aliases of raw sensors.
- Do NOT output identity or near-identity projections such as:
  - temperature-only passthrough,
  - humidity-only passthrough,
  - light-only passthrough,
  - trivial renames of those raw measures.
- Each generated variable should combine at least 2 sensor weights with meaningful non-zero contribution.
- The app will assign generated objectives/thresholds internally; do not return objective or threshold fields.
- concise labels/descriptions
- valid JSON only; no extra keys`;

export function buildWorldModelPrompt(userPrompt: string) {
  return `${WORLD_MODEL_PROMPT_TEMPLATE}

User prompt: ${userPrompt}`;
}
