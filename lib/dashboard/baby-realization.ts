import type {
  BabyDiscreteConfig,
  BabyRealizationConfig,
  BabyRealizedProjection,
  BabySnapshot,
  BabyTraitConfig,
  BabyTraitMode,
} from "./types";

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
  pumpPower: { levels: [50, 75, 100] as const, unit: "%" },
  microServoAngle: { levels: [0, 90] as const, neutralLeft: 90, neutralRight: 90, unit: "deg" },
  lightColor: { levels: ["Red", "Green"] as const },
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

function nearestPump(value: number): BabyDiscreteConfig["pumpPower"] {
  if (value <= 62.5) return 50;
  if (value <= 87.5) return 75;
  return 100;
}

function nearestAngle(value: number): BabyDiscreteConfig["microServoAngle"] {
  return value < 45 ? 0 : 90;
}

function projectedLightColor(aggression: number): BabyDiscreteConfig["lightColor"] {
  return aggression >= 0.5 ? "Red" : "Green";
}

export function projectBabyTraits(snapshot: BabySnapshot, traits: BabyTraitConfig): BabyRealizedProjection {
  const thermalDelta = Math.max(0, snapshot.sensors.temperatureF - snapshot.monitorThresholdF);
  const humidityFactor = clampValue(snapshot.sensors.humidityPct / 100, 0, 1);
  const speedFactor = clampValue((traits.speed - BABY_REALIZATION.speed.min) / (BABY_REALIZATION.speed.max - BABY_REALIZATION.speed.min), 0, 1);
  const aggression = clampValue(modeAggression(traits.mode) * 0.7 + speedFactor * 0.3, 0, 1);

  const pumpRaw = clampValue(
    22 + traits.bodySize * 0.58 + thermalDelta * 2.1,
    DEMO_REALIZABLE_LIMITS.pumpPower.levels[0],
    DEMO_REALIZABLE_LIMITS.pumpPower.levels[DEMO_REALIZABLE_LIMITS.pumpPower.levels.length - 1]
  );
  const angleRaw = humidityFactor * 90;

  return {
    pumpPower: nearestPump(pumpRaw),
    microServoAngle: nearestAngle(angleRaw),
    lightColor: projectedLightColor(aggression),
    explanation: {
      pumpPower: "Discrete output for demo hardware: pump power can only be 50, 75, or 100.",
      microServoAngle: "Discrete output for demo hardware: micro-servo angle can only be 0 or 90 (applied as a pair: angle, angle).",
      lightColor: "Light color is discrete: Red means more aggressive behavior, Green means less aggressive.",
    },
  };
}

export function discreteConfigSignature(config: BabyDiscreteConfig) {
  return `${config.pumpPower}|${config.microServoAngle}|${config.lightColor}`;
}

function allDiscreteCombos(): BabyDiscreteConfig[] {
  const combos: BabyDiscreteConfig[] = [];
  for (const pumpPower of DEMO_REALIZABLE_LIMITS.pumpPower.levels) {
    for (const microServoAngle of DEMO_REALIZABLE_LIMITS.microServoAngle.levels) {
      for (const lightColor of DEMO_REALIZABLE_LIMITS.lightColor.levels) {
        combos.push({ pumpPower, microServoAngle, lightColor });
      }
    }
  }
  return combos;
}

export function ensureUniqueProjection(
  current: BabyRealizedProjection,
  forbidden: BabyDiscreteConfig[]
): { projection: BabyRealizedProjection; adjusted: boolean } {
  const forbiddenSet = new Set(forbidden.map(discreteConfigSignature));
  const currentSignature = discreteConfigSignature(current);
  if (!forbiddenSet.has(currentSignature)) {
    return { projection: current, adjusted: false };
  }

  const replacement = allDiscreteCombos().find((combo) => !forbiddenSet.has(discreteConfigSignature(combo)));
  if (!replacement) {
    return { projection: current, adjusted: false };
  }

  return {
    projection: {
      ...current,
      ...replacement,
    },
    adjusted: true,
  };
}
