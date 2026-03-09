import type { DerivedObjective } from "./types";

export function isThresholdBreached(objective: DerivedObjective, value: number, threshold: number) {
  if (objective === "maximize") return value < threshold;
  if (objective === "minimize") return value > threshold;
  if (objective === "monitor") return value <= 0 || value >= threshold;
  return false;
}

export function thresholdLabel(objective: DerivedObjective, threshold: number) {
  if (objective === "maximize") return `min ${threshold.toFixed(1)}`;
  if (objective === "minimize") return `max ${threshold.toFixed(1)}`;
  if (objective === "monitor") return `0 < x < ${threshold.toFixed(1)}`;
  return "off";
}
