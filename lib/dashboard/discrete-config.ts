import type { BabyDiscreteConfig } from "./types";

export const DISCRETE_PUMP_LEVELS = [50, 75, 100] as const;
export const DISCRETE_SERVO_ANGLES = [-90, -45, 0, 45, 90] as const;
export const DISCRETE_LIGHT_COLORS = ["red", "green", "blue"] as const;

export function sanitizePumpPower(value: unknown): BabyDiscreteConfig["pumpPower"] {
  const numeric = Number(value);
  if (numeric === 50 || numeric === 75 || numeric === 100) return numeric;
  return 50;
}

export function sanitizeMicroServoAngle(value: unknown): BabyDiscreteConfig["microServoAngle"] {
  const numeric = Number(value);
  if (numeric === -90 || numeric === -45 || numeric === 0 || numeric === 45 || numeric === 90) return numeric;
  return 0;
}

export function sanitizeLightColor(value: unknown): BabyDiscreteConfig["lightColor"] {
  const color = String(value ?? "").toLowerCase();
  if (color === "red" || color === "green" || color === "blue") return color;
  return "green";
}

export function sanitizeDiscreteConfig(input: unknown): BabyDiscreteConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  return {
    pumpPower: sanitizePumpPower(raw.pumpPower),
    microServoAngle: sanitizeMicroServoAngle(raw.microServoAngle),
    lightColor: sanitizeLightColor(raw.lightColor),
  };
}

export function sanitizeDiscreteConfigList(input: unknown): BabyDiscreteConfig[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => sanitizeDiscreteConfig(item))
    .filter((item): item is BabyDiscreteConfig => item !== null);
}
