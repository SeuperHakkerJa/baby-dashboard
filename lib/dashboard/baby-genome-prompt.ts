import type { BabyDiscreteConfig, BabySnapshot } from "./types";

// Standalone prompt template for baby trait generation.
// Edit this file to tune model behavior without touching route logic.
export const BABY_GENOME_PROMPT_TEMPLATE = `Return compact JSON only (no markdown):
{
  "interpretation": string
}

Task:
- Use the world-model snapshot in snapshot.derived as the primary decision signal.
- Treat "fixed_surrounding_temperature" in snapshot.derived as the thermal trigger context.
- Treat "fixed_photon_flux" in snapshot.derived as the light-stress context.
- Use snapshot.sensors only as secondary context if needed.
- Write one vivid, hackathon-friendly line (max 40 words) describing:
  1) how the current environment feels, and
  2) what kind of offspring should be created.
- Frame birth as adaptive succession: the current body cannot safely handle the current heat/light regime, so the next generation should be better tuned to survive it.
- This is ungrounded analysis: do NOT mention pump, angle, color, or hardware limits.
- No rationale text, no extra keys.`;

export function buildBabyGenomePrompt(snapshot: BabySnapshot, forbiddenConfigs: BabyDiscreteConfig[]) {
  return `${BABY_GENOME_PROMPT_TEMPLATE}

Snapshot payload: ${JSON.stringify(snapshot)}
Forbidden realized discrete configs (must not repeat):
${JSON.stringify(forbiddenConfigs)}
Instruction:
- Produce a distinctive interpretation line; avoid generic wording.`;
}
