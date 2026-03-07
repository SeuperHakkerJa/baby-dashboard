// Edit this file to tune how the generated derived world-state model is built.
// Note: The app always appends two fixed local derived states after model output:
// - Surrounding Temperature (direct passthrough of temperatureF)
// - Hue (computed from cameraR/cameraG/cameraB)

export const WORLD_MODEL_PROMPT_TEMPLATE = `You are generating a compact task-conditioned world model for an adaptive robot.

Primitive sensor inputs available for weighted formulas:
- temperatureF
- acousticDb
- cameraR
- cameraG
- cameraB

Generate ONLY 3-4 derived world-state variables for this mission.
Do not include Surrounding Temperature or Hue; those are appended locally by the app.

Return compact JSON only (no markdown):
{
  "title": string,
  "definitions": [
    {
      "id": string,
      "label": string,
      "description": string,
      "objective": "maximize" | "minimize",
      "weights": {
        "temperatureF": number,
        "acousticDb": number,
        "cameraR": number,
        "cameraG": number,
        "cameraB": number
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
- concise labels/descriptions
- valid JSON only; no extra keys`;

export function buildWorldModelPrompt(userPrompt: string) {
  return `${WORLD_MODEL_PROMPT_TEMPLATE}

User prompt: ${userPrompt}`;
}
