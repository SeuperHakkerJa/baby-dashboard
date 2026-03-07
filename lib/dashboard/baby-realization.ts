import type { BabyRealizationConfig, BabyRealizedProjection, BabySnapshot, BabyTraitConfig, BabyTraitMode } from "./types";

// Standalone realizability interface for demo tuning.
// Edit these bounds/modes directly to reflect what your hardware can realize.
export const BABY_REALIZATION: BabyRealizationConfig = {
  speed: { min: 0.2, max: 3.8, unit: "m/s" },
  breathingRate: { min: 8, max: 68, unit: "rpm" },
  bodySize: { min: 18, max: 120, unit: "cm" },
  allowedModes: ["balanced", "heat-shield", "sprint", "conserve", "stealth"],
  fallbackMode: "balanced",
};

export const DEMO_REALIZABLE_LIMITS = {
  pumpPower: { min: 0, max: 100, unit: "%" },
  microServoAngle: { min: 0, max: 180, neutralLeft: 90, neutralRight: 90, unit: "deg" },
  color: {
    r: { min: 0, max: 255 },
    g: { min: 0, max: 255 },
    b: { min: 0, max: 255 },
    unit: "rgb",
  },
} as const;

function clampValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMode(mode: string): BabyTraitMode {
  const candidate = mode.toLowerCase().trim() as BabyTraitMode;
  return BABY_REALIZATION.allowedModes.includes(candidate) ? candidate : BABY_REALIZATION.fallbackMode;
}

export function realizeBabyTraits(input: Partial<BabyTraitConfig>): BabyTraitConfig {
  const speed = clampValue(
    Number.isFinite(input.speed) ? Number(input.speed) : 1.2,
    BABY_REALIZATION.speed.min,
    BABY_REALIZATION.speed.max
  );
  const breathingRate = clampValue(
    Number.isFinite(input.breathingRate) ? Number(input.breathingRate) : 22,
    BABY_REALIZATION.breathingRate.min,
    BABY_REALIZATION.breathingRate.max
  );
  const bodySize = clampValue(
    Number.isFinite(input.bodySize) ? Number(input.bodySize) : 48,
    BABY_REALIZATION.bodySize.min,
    BABY_REALIZATION.bodySize.max
  );

  return {
    speed: Number(speed.toFixed(2)),
    breathingRate: Number(breathingRate.toFixed(1)),
    bodySize: Number(bodySize.toFixed(1)),
    mode: normalizeMode(String(input.mode ?? BABY_REALIZATION.fallbackMode)),
  };
}

function modeAggression(mode: BabyTraitMode) {
  if (mode === "sprint") return 0.9;
  if (mode === "heat-shield") return 0.72;
  if (mode === "balanced") return 0.5;
  if (mode === "conserve") return 0.3;
  return 0.2;
}

export function projectBabyTraits(snapshot: BabySnapshot, traits: BabyTraitConfig): BabyRealizedProjection {
  const thermalDelta = Math.max(0, snapshot.sensors.temperatureF - snapshot.monitorThresholdF);
  const loudnessFactor = clampValue((snapshot.sensors.acousticDb - 10) / 85, 0, 1);
  const speedFactor = clampValue((traits.speed - BABY_REALIZATION.speed.min) / (BABY_REALIZATION.speed.max - BABY_REALIZATION.speed.min), 0, 1);
  const aggression = clampValue(modeAggression(traits.mode) * 0.7 + speedFactor * 0.3, 0, 1);

  const pumpPower = clampValue(
    22 + traits.bodySize * 0.58 + thermalDelta * 2.1,
    DEMO_REALIZABLE_LIMITS.pumpPower.min,
    DEMO_REALIZABLE_LIMITS.pumpPower.max
  );

  const angleOffset = loudnessFactor * 70;
  const servoLeft = clampValue(
    DEMO_REALIZABLE_LIMITS.microServoAngle.neutralLeft + angleOffset,
    DEMO_REALIZABLE_LIMITS.microServoAngle.min,
    DEMO_REALIZABLE_LIMITS.microServoAngle.max
  );
  const servoRight = clampValue(
    DEMO_REALIZABLE_LIMITS.microServoAngle.neutralRight + angleOffset,
    DEMO_REALIZABLE_LIMITS.microServoAngle.min,
    DEMO_REALIZABLE_LIMITS.microServoAngle.max
  );

  const red = clampValue(40 + aggression * 215, DEMO_REALIZABLE_LIMITS.color.r.min, DEMO_REALIZABLE_LIMITS.color.r.max);
  const green = clampValue(
    40 + (1 - aggression) * 215,
    DEMO_REALIZABLE_LIMITS.color.g.min,
    DEMO_REALIZABLE_LIMITS.color.g.max
  );
  const blue = clampValue(26 + (1 - loudnessFactor) * 84, DEMO_REALIZABLE_LIMITS.color.b.min, DEMO_REALIZABLE_LIMITS.color.b.max);

  return {
    pumpPower: Number(pumpPower.toFixed(1)),
    microServoAngle: {
      left: Number(servoLeft.toFixed(1)),
      right: Number(servoRight.toFixed(1)),
    },
    color: {
      r: Number(red.toFixed(0)),
      g: Number(green.toFixed(0)),
      b: Number(blue.toFixed(0)),
    },
    explanation: {
      pumpPower: "Hotter environment and larger body-size target increase pump power.",
      microServoAngle: "Louder environment increases both micro-servo angles from neutral (90,90).",
      color: "Redder color means more aggressive baby behavior; greener means less aggressive.",
    },
  };
}
