// Edit this file to tune how the generated derived world-state model is built.
// Note: The app always appends one fixed local derived state after model output:
// - Surrounding Temperature (direct passthrough of temperatureF)

export const WORLD_MODEL_PROMPT_TEMPLATE = `You are generating a compact task-conditioned world model for an adaptive robot.

Primitive sensor inputs available for weighted formulas:
- temperatureF
- humidityPct
- lightLevel

Generate ONLY 3-4 derived world-state variables for this mission.
Do not include Surrounding Temperature; that is appended locally by the app.

Return compact JSON only (no markdown):
{
  "title": string,
  "definitions": [
    {
      "id": string,
      "label": string,
      "description": string,
      "objective": "maximize" | "minimize" | "none",
      "weights": {
        "temperatureF": number,
        "humidityPct": number,
        "lightLevel": number
      },
      "bias": number,
      "threshold": number
    }
  ]
}

Rules:
- 3-4 definitions only
- weights in [-1.5, 1.5]
- bias in [0, 60]
- threshold in [0, 100]
- objective "none" means monitor-only (no directional optimization target)
- concise labels/descriptions
- valid JSON only; no extra keys`;

export function buildWorldModelPrompt(userPrompt: string) {
  return `${WORLD_MODEL_PROMPT_TEMPLATE}

User prompt: ${userPrompt}`;
}
