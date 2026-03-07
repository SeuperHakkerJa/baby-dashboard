// Edit this file to tune how the derived world-state model is generated.
// Keep the JSON structure compatible with sanitizeWorldModel in pipeline.ts.

export const WORLD_MODEL_PROMPT_TEMPLATE = `You are generating a compact task-conditioned world model for an adaptive robot.

The robot receives primitive sensor inputs:
- lightLux
- cameraColorK
- acousticDb
- temperatureC

Your job is to invent 3-4 derived world-state variables that the robot should monitor for this mission.
These variables are NOT raw sensor names. They are higher-level latent states that help the robot judge:
- what matters in the environment
- what should be expected
- what counts as stress, instability, opportunity, or mismatch
- when the robot's current body may be becoming a limitation

Each derived variable must be represented as a weighted linear combination of the primitive sensors plus a bias.

Return compact JSON only (no markdown) in exactly this format:
{
  "title": string,
  "definitions": [
    {
      "id": string,
      "label": string,
      "description": string,
      "objective": "maximize" | "minimize",
      "weights": {
        "lightLux": number,
        "cameraColorK": number,
        "acousticDb": number,
        "temperatureC": number
      },
      "bias": number
    }
  ]
}

Hard rules:
- 3-4 definitions only
- weights must be in [-1.5, 1.5]
- bias must be in [0, 60]
- labels and descriptions must be concise
- output valid JSON only
- no markdown
- no extra keys

Modeling rules:
- invent variables that are useful for adaptation under the mission, not generic summaries
- prefer latent concepts such as exposure stability, thermal survivability, sensory ambiguity, stealth pressure, mobility stress, habitat compatibility, navigation confidence, or environmental hostility
- do NOT simply restate single raw sensors as labels like "temperature level" or "noise"
- at least 2 definitions must combine 2 or more non-zero sensor weights
- include at least 1 definition that estimates body-environment fit, embodiment adequacy, or adaptation pressure
- definitions should be meaningfully distinct from one another
- choose objective based on what the robot would want for mission success
- descriptions should explain what the variable means for the mission in one short sentence
- title should sound like a named world model, not a sentence

Few-shot examples:

Example user prompt:
Explore a dark enclosed cave while staying stable and avoiding overheating.

Example output:
{
  "title": "Subterranean Adaptation Model",
  "definitions": [
    {
      "id": "navigation_confidence",
      "label": "Navigation Confidence",
      "description": "How reliably the robot can orient and move through the cave.",
      "objective": "maximize",
      "weights": {
        "lightLux": 0.9,
        "cameraColorK": 0.35,
        "acousticDb": -0.45,
        "temperatureC": -0.15
      },
      "bias": 22
    },
    {
      "id": "thermal_load",
      "label": "Thermal Load",
      "description": "Accumulated heat stress that may reduce endurance.",
      "objective": "minimize",
      "weights": {
        "lightLux": 0.15,
        "cameraColorK": 0.1,
        "acousticDb": 0.25,
        "temperatureC": 1.2
      },
      "bias": 18
    },
    {
      "id": "sensory_ambiguity",
      "label": "Sensory Ambiguity",
      "description": "How unclear or conflicting the environment appears to the robot.",
      "objective": "minimize",
      "weights": {
        "lightLux": -0.7,
        "cameraColorK": -0.5,
        "acousticDb": 0.6,
        "temperatureC": 0.1
      },
      "bias": 28
    },
    {
      "id": "habitat_fit",
      "label": "Habitat Fit",
      "description": "Overall suitability of the robot's current body for this cave.",
      "objective": "maximize",
      "weights": {
        "lightLux": 0.45,
        "cameraColorK": 0.25,
        "acousticDb": -0.55,
        "temperatureC": -0.65
      },
      "bias": 24
    }
  ]
}

Example user prompt:
Operate quietly in an indoor search mission where stealth, heat control, and reliable navigation all matter.

Example output:
{
  "title": "Stealth Search Adaptation Model",
  "definitions": [
    {
      "id": "stealth_pressure",
      "label": "Stealth Pressure",
      "description": "How strongly the environment punishes detectable presence.",
      "objective": "minimize",
      "weights": {
        "lightLux": 0.3,
        "cameraColorK": 0.1,
        "acousticDb": 1.2,
        "temperatureC": 0.15
      },
      "bias": 12
    },
    {
      "id": "route_clarity",
      "label": "Route Clarity",
      "description": "How confidently the robot can move without hesitation.",
      "objective": "maximize",
      "weights": {
        "lightLux": 0.75,
        "cameraColorK": 0.4,
        "acousticDb": -0.35,
        "temperatureC": -0.15
      },
      "bias": 23
    },
    {
      "id": "actuation_stress",
      "label": "Actuation Stress",
      "description": "How demanding the current environment is on movement and control.",
      "objective": "minimize",
      "weights": {
        "lightLux": -0.1,
        "cameraColorK": 0.15,
        "acousticDb": 0.8,
        "temperatureC": 0.9
      },
      "bias": 19
    },
    {
      "id": "embodiment_adequacy",
      "label": "Embodiment Adequacy",
      "description": "How sufficient the current body is for completing the mission.",
      "objective": "maximize",
      "weights": {
        "lightLux": 0.35,
        "cameraColorK": 0.2,
        "acousticDb": -0.6,
        "temperatureC": -0.8
      },
      "bias": 30
    }
  ]
}

Now generate the world model for this user prompt.`;

export function buildWorldModelPrompt(userPrompt: string) {
  return `${WORLD_MODEL_PROMPT_TEMPLATE}

User prompt: ${userPrompt}`;
}