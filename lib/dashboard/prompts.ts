import { MODEL_OBJECTIVE } from "./schema";
import type { PlannerPayload } from "./types";

export function buildPlannerPrompt(payload: PlannerPayload, generation: number) {
  return `Return JSON only (no markdown).
Objective: ${MODEL_OBJECTIVE}
Set babyConfig.generation=${generation}.
Keep fields machine-consumable; no rationale text.
Constraints: genome values 0..100; confidence/windowMinutes 0..100; decision.reasonCode in READY|UNSTABLE|HIGH_HAZARD|LOW_CONFIDENCE|LOW_READINESS|SHORT_WINDOW.
Planner payload: ${JSON.stringify(payload)}`;
}
