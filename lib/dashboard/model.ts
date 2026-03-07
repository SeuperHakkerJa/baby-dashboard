import { ACTUATOR_OUTPUT_SCHEMA, DEFAULT_THRESHOLDS, MODEL_OBJECTIVE, SENSOR_INPUT_SCHEMA } from "./schema";
import type {
  ActuatorOutput,
  BabyConfig,
  BirthDecision,
  DerivedState,
  GenomeVector,
  HistoryPoint,
  PlannerPayload,
  PlannerResponse,
  SensorInput,
  SurvivalThresholds,
} from "./types";

const HISTORY_LIMIT = 180;

const IDEAL = {
  temperatureF: { min: 68, max: 79 },
  acousticDb: { min: 18, max: 42 },
  cameraR: { min: 105, max: 190 },
  cameraG: { min: 105, max: 190 },
  cameraB: { min: 105, max: 210 },
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function rgbToHueDeg(r: number, g: number, b: number) {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  if (delta === 0) return 0;

  let hue = 0;
  if (max === rn) {
    hue = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    hue = (bn - rn) / delta + 2;
  } else {
    hue = (rn - gn) / delta + 4;
  }

  const deg = hue * 60;
  return deg < 0 ? deg + 360 : deg;
}

function cameraScore(sensors: SensorInput) {
  const r = centeredScore(
    sensors.cameraR,
    IDEAL.cameraR.min,
    IDEAL.cameraR.max,
    SENSOR_INPUT_SCHEMA.cameraR.min,
    SENSOR_INPUT_SCHEMA.cameraR.max
  );
  const g = centeredScore(
    sensors.cameraG,
    IDEAL.cameraG.min,
    IDEAL.cameraG.max,
    SENSOR_INPUT_SCHEMA.cameraG.min,
    SENSOR_INPUT_SCHEMA.cameraG.max
  );
  const b = centeredScore(
    sensors.cameraB,
    IDEAL.cameraB.min,
    IDEAL.cameraB.max,
    SENSOR_INPUT_SCHEMA.cameraB.min,
    SENSOR_INPUT_SCHEMA.cameraB.max
  );
  return (r + g + b) / 3;
}

function centeredScore(value: number, min: number, max: number, hardMin: number, hardMax: number) {
  const center = (min + max) / 2;
  const half = (max - min) / 2;
  const distance = Math.abs(value - center);
  const normalized = distance / Math.max(half, 0.0001);
  const softScore = clamp(100 - normalized * 45);

  if (value >= min && value <= max) return softScore;
  const edgeDistance = value < min ? min - value : value - max;
  const hardRange = value < min ? min - hardMin : hardMax - max;
  const hardPenalty = clamp((edgeDistance / Math.max(hardRange, 1)) * 80);
  return clamp(softScore - hardPenalty);
}

function std(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function trendSlope(history: HistoryPoint[]) {
  const recent = history.slice(-24).map((p) => p.derived.stability);
  if (recent.length < 3) return 0;

  const n = recent.length;
  const xMean = (n - 1) / 2;
  const yMean = recent.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (recent[i] - yMean);
    den += (i - xMean) ** 2;
  }

  if (den === 0) return 0;
  return num / den;
}

export function deriveState(sensors: SensorInput, history: HistoryPoint[]): DerivedState {
  const thermalScore = centeredScore(
    sensors.temperatureF,
    IDEAL.temperatureF.min,
    IDEAL.temperatureF.max,
    SENSOR_INPUT_SCHEMA.temperatureF.min,
    SENSOR_INPUT_SCHEMA.temperatureF.max
  );
  const acousticScore = centeredScore(
    sensors.acousticDb,
    IDEAL.acousticDb.min,
    IDEAL.acousticDb.max,
    SENSOR_INPUT_SCHEMA.acousticDb.min,
    SENSOR_INPUT_SCHEMA.acousticDb.max
  );
  const visualScore = cameraScore(sensors);

  const stability = clamp(visualScore * 0.34 + acousticScore * 0.31 + thermalScore * 0.35);
  const noisePenalty = clamp((sensors.acousticDb - 40) * 2.2, 0, 100);
  const thermalPenalty = clamp(Math.abs(sensors.temperatureF - 73) * 2.7, 0, 100);
  const volatility = std(history.slice(-15).map((p) => p.derived.stability));

  const hazardIndex = clamp((100 - stability) * 0.6 + noisePenalty * 0.2 + thermalPenalty * 0.12 + volatility * 1.2);
  const signalQuality = clamp(visualScore * 0.64 + acousticScore * 0.18 + thermalScore * 0.18);

  const slope = trendSlope(history);
  const slopePerMinute = slope * 60;

  let forecastToUnsafeMin = 45;
  if (slopePerMinute < -0.35) {
    const delta = Math.max(stability - DEFAULT_THRESHOLDS.minStability, 0.1);
    forecastToUnsafeMin = clamp(delta / Math.abs(slopePerMinute), 1, 45);
  }

  const historyFactor = clamp((history.length / 100) * 100);
  const variancePenalty = clamp(volatility * 3.4);
  const modelConfidence = clamp(historyFactor * 0.62 + (100 - variancePenalty) * 0.38);

  const reproductiveReadiness = clamp(
    stability * 0.38 +
      (100 - hazardIndex) * 0.26 +
      modelConfidence * 0.24 +
      clamp(forecastToUnsafeMin * 2.2, 0, 100) * 0.12
  );

  const survivalProbability = clamp(
    stability * 0.36 +
      (100 - hazardIndex) * 0.29 +
      modelConfidence * 0.2 +
      clamp(forecastToUnsafeMin * 2.4, 0, 100) * 0.15
  );

  return {
    stability,
    hazardIndex,
    signalQuality,
    trendSlope: slopePerMinute,
    forecastToUnsafeMin,
    modelConfidence,
    reproductiveReadiness,
    survivalProbability,
  };
}

export function recommendActuators(sensors: SensorInput, derived: DerivedState): ActuatorOutput {
  const hueDeg = rgbToHueDeg(sensors.cameraR, sensors.cameraG, sensors.cameraB);
  const angleDeg = clamp(88 + (hueDeg - 180) * 0.06 - (sensors.acousticDb - 35) * 0.55, 8, 172);
  const lightHue = clamp(hueDeg + (derived.hazardIndex - 50) * 0.25, 0, 360);
  const lightFrequencyHz = Number((clamp(0.8 + derived.hazardIndex * 0.045, 0.2, 8.8) / 1).toFixed(2));
  const pumpSpeedPct = clamp(34 + (sensors.temperatureF - 72) * 2 + derived.hazardIndex * 0.42, 5, 100);

  return {
    angleDeg,
    lightHue,
    lightFrequencyHz,
    pumpSpeedPct,
  };
}

export function decideBirth(derived: DerivedState, thresholds: SurvivalThresholds): BirthDecision {
  const triggerScore = clamp(
    derived.reproductiveReadiness * 0.48 +
      derived.survivalProbability * 0.3 +
      derived.modelConfidence * 0.12 +
      clamp(derived.forecastToUnsafeMin * 2.3, 0, 100) * 0.1
  );

  const windowMinutes = Number(Math.max(0, derived.forecastToUnsafeMin * (derived.stability / 100)).toFixed(1));

  const reasonCode: BirthDecision["reasonCode"] =
    derived.stability < thresholds.minStability
      ? "UNSTABLE"
      : derived.hazardIndex > thresholds.maxHazard
      ? "HIGH_HAZARD"
      : derived.modelConfidence < thresholds.minModelConfidence
      ? "LOW_CONFIDENCE"
      : derived.reproductiveReadiness < thresholds.minReadiness
      ? "LOW_READINESS"
      : windowMinutes < thresholds.minForecastWindowMin
      ? "SHORT_WINDOW"
      : "READY";

  return {
    shouldBirth: reasonCode === "READY",
    triggerScore,
    windowMinutes,
    unsafeInMinutes: Number(derived.forecastToUnsafeMin.toFixed(1)),
    reasonCode,
  };
}

export function buildGenomeVector(sensors: SensorInput, derived: DerivedState, decision: BirthDecision): GenomeVector {
  const hue = rgbToHueDeg(sensors.cameraR, sensors.cameraG, sensors.cameraB);
  const chromaAverage = (sensors.cameraR + sensors.cameraG + sensors.cameraB) / 3;

  return {
    thermalTolerance: clamp(52 + (74 - sensors.temperatureF) * 1.2 + derived.stability * 0.22),
    acousticShielding: clamp(34 + sensors.acousticDb * 0.7 + derived.hazardIndex * 0.22),
    photonicAdaptation: clamp(40 + hue * 0.08 + derived.signalQuality * 0.24),
    chromaticSensitivity: clamp(30 + chromaAverage * 0.18 + derived.signalQuality * 0.48),
    fluidRegulation: clamp(45 + derived.hazardIndex * 0.35 + (sensors.temperatureF - 72) * 0.9),
    orientationControl: clamp(52 + derived.modelConfidence * 0.3 + (100 - derived.hazardIndex) * 0.2),
    sensorFusion: clamp(42 + derived.signalQuality * 0.52 + derived.modelConfidence * 0.24),
    predictiveMemory: clamp(35 + derived.modelConfidence * 0.62 + Math.max(0, -derived.trendSlope) * 3),
    structuralFlex: clamp(48 + derived.stability * 0.34 - derived.hazardIndex * 0.12),
    stressRecovery: clamp(33 + (100 - derived.hazardIndex) * 0.58 + decision.windowMinutes * 0.6),
    resourceFrugality: clamp(44 + (100 - derived.survivalProbability) * 0.2 + derived.modelConfidence * 0.41),
    reserveCapacity: clamp(46 + decision.windowMinutes * 1.2 + derived.survivalProbability * 0.32),
  };
}

export function buildBabyConfig(generation: number, payload: PlannerPayload, decision: BirthDecision): BabyConfig {
  return {
    generation,
    createdAt: new Date().toISOString(),
    objective: MODEL_OBJECTIVE,
    sensorMeaning: {
      temperatureF: SENSOR_INPUT_SCHEMA.temperatureF.meaning,
      cameraR: SENSOR_INPUT_SCHEMA.cameraR.meaning,
      cameraG: SENSOR_INPUT_SCHEMA.cameraG.meaning,
      cameraB: SENSOR_INPUT_SCHEMA.cameraB.meaning,
      acousticDb: SENSOR_INPUT_SCHEMA.acousticDb.meaning,
    },
    actuatorControl: {
      angleDeg: ACTUATOR_OUTPUT_SCHEMA.angleDeg.meaning,
      lightHue: ACTUATOR_OUTPUT_SCHEMA.lightHue.meaning,
      lightFrequencyHz: ACTUATOR_OUTPUT_SCHEMA.lightFrequencyHz.meaning,
      pumpSpeedPct: ACTUATOR_OUTPUT_SCHEMA.pumpSpeedPct.meaning,
    },
    decision,
    genome: buildGenomeVector(payload.sensors, payload.derived, decision),
    survivalEstimate: Number(payload.derived.survivalProbability.toFixed(1)),
  };
}

export function buildPlannerPayload(
  sensors: SensorInput,
  derived: DerivedState,
  actuators: ActuatorOutput,
  thresholds: SurvivalThresholds,
  history: HistoryPoint[]
): PlannerPayload {
  return {
    sensors,
    derived,
    actuators,
    thresholds,
    history: history.slice(-60).map((point) => ({
      label: point.label,
      stability: Number(point.derived.stability.toFixed(1)),
      hazardIndex: Number(point.derived.hazardIndex.toFixed(1)),
      survival: Number(point.survival.toFixed(1)),
    })),
  };
}

export function localPlanner(payload: PlannerPayload, generation: number): PlannerResponse {
  const decision = decideBirth(payload.derived, payload.thresholds);
  return {
    shouldBirth: decision.shouldBirth,
    windowMinutes: decision.windowMinutes,
    confidence: Number(payload.derived.modelConfidence.toFixed(1)),
    babyConfig: buildBabyConfig(generation, payload, decision),
  };
}

export function safePointLabel(index: number) {
  const minute = Math.floor(index / 60);
  const second = index % 60;
  return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

export function buildInitialSensors(): SensorInput {
  return {
    temperatureF: 74.2,
    cameraR: 152,
    cameraG: 173,
    cameraB: 204,
    acousticDb: 34.5,
  };
}

export function simulateSensorStep(prev: SensorInput): SensorInput {
  const jitter = (v: number, span: number) => v + (Math.random() - 0.5) * span;

  const next: SensorInput = {
    temperatureF: clamp(jitter(prev.temperatureF, 1.5), SENSOR_INPUT_SCHEMA.temperatureF.min, SENSOR_INPUT_SCHEMA.temperatureF.max),
    cameraR: clamp(jitter(prev.cameraR, 16), SENSOR_INPUT_SCHEMA.cameraR.min, SENSOR_INPUT_SCHEMA.cameraR.max),
    cameraG: clamp(jitter(prev.cameraG, 16), SENSOR_INPUT_SCHEMA.cameraG.min, SENSOR_INPUT_SCHEMA.cameraG.max),
    cameraB: clamp(jitter(prev.cameraB, 16), SENSOR_INPUT_SCHEMA.cameraB.min, SENSOR_INPUT_SCHEMA.cameraB.max),
    acousticDb: clamp(jitter(prev.acousticDb, 3.2), SENSOR_INPUT_SCHEMA.acousticDb.min, SENSOR_INPUT_SCHEMA.acousticDb.max),
  };

  if (Math.random() > 0.95) next.acousticDb = clamp(next.acousticDb + 7, SENSOR_INPUT_SCHEMA.acousticDb.min, SENSOR_INPUT_SCHEMA.acousticDb.max);
  if (Math.random() > 0.965) next.temperatureF = clamp(next.temperatureF + 3.2, SENSOR_INPUT_SCHEMA.temperatureF.min, SENSOR_INPUT_SCHEMA.temperatureF.max);
  if (Math.random() > 0.97) {
    next.cameraR = clamp(next.cameraR + 22, SENSOR_INPUT_SCHEMA.cameraR.min, SENSOR_INPUT_SCHEMA.cameraR.max);
    next.cameraB = clamp(next.cameraB - 18, SENSOR_INPUT_SCHEMA.cameraB.min, SENSOR_INPUT_SCHEMA.cameraB.max);
  }

  return {
    temperatureF: Number(next.temperatureF.toFixed(1)),
    cameraR: Number(next.cameraR.toFixed(0)),
    cameraG: Number(next.cameraG.toFixed(0)),
    cameraB: Number(next.cameraB.toFixed(0)),
    acousticDb: Number(next.acousticDb.toFixed(1)),
  };
}

export function buildHistoryPoint(index: number, sensors: SensorInput, derived: DerivedState): HistoryPoint {
  return {
    t: index,
    label: safePointLabel(index),
    sensors,
    derived,
    survival: Number(derived.survivalProbability.toFixed(1)),
  };
}

export function trimHistory(history: HistoryPoint[], limit = HISTORY_LIMIT) {
  return history.slice(-limit);
}
