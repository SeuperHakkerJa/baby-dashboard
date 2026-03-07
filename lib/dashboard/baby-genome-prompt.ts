import type { BabySnapshot } from "./types";

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
- Use the snapshot to propose a new baby body profile.
- Focus ONLY on: speed, breathingRate, bodySize, mode.
- Assume high-temperature risk is the primary trigger.
- Keep values physically plausible for a small embodied robot.
- Realization semantics for demo:
  - Redder color => more aggressive baby behavior; greener => less aggressive.
  - Louder environment => larger micro-servo angle.
  - Hotter environment => larger size and higher pump-power projection.
- No rationale text, no extra keys.`;

export function buildBabyGenomePrompt(snapshot: BabySnapshot) {
  return `${BABY_GENOME_PROMPT_TEMPLATE}

Snapshot payload: ${JSON.stringify(snapshot)}`;
}
