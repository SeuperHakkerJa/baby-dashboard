import type { BabyDiscreteConfig, BabySnapshot } from "./types";

// Standalone prompt template for baby trait generation.
// Edit this file to tune model behavior without touching route logic.
export const BABY_GENOME_PROMPT_TEMPLATE = `Return compact JSON only (no markdown):
{
  "traits": {
    "speed": number,
    "breathingRate": number,
    "bodySize": number,
    "mode": "balanced" | "heat-shield" | "sprint" | "conserve" | "stealth"
  }
}

Task:
- Use the world-model snapshot in snapshot.derived as the primary decision signal.
- Treat "fixed_surrounding_temperature" in snapshot.derived as the thermal trigger context.
- Use snapshot.sensors only as secondary context if needed.
- Focus ONLY on: speed, breathingRate, bodySize, mode.
- Assume high-temperature risk is the primary trigger.
- Keep values physically plausible for a small embodied robot.
- Realization semantics for demo:
  - color is discrete: red => more aggressive, green => less aggressive, blue => balanced.
  - angle is discrete and single-value: -90, -45, 0, 45, 90.
  - Higher humidity should push toward larger positive angle.
  - Hotter environment => larger size and higher pump-power projection.
- No rationale text, no extra keys.`;

export function buildBabyGenomePrompt(snapshot: BabySnapshot, forbiddenConfigs: BabyDiscreteConfig[]) {
  return `${BABY_GENOME_PROMPT_TEMPLATE}

Snapshot payload: ${JSON.stringify(snapshot)}
Forbidden realized discrete configs (must not repeat):
${JSON.stringify(forbiddenConfigs)}
Instruction:
- Produce a body profile that realizes to a DIFFERENT discrete config than every forbidden item.`;
}
