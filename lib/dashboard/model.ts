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
  lightLux: { min: 320, max: 720 },
  cameraColorK: { min: 4600, max: 6200 },
  acousticDb: { min: 18, max: 42 },
  temperatureC: { min: 21.5, max: 27.5 },
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
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
  const lightScore = centeredScore(sensors.lightLux, IDEAL.lightLux.min, IDEAL.lightLux.max, SENSOR_INPUT_SCHEMA.lightLux.min, SENSOR_INPUT_SCHEMA.lightLux.max);
  const colorScore = centeredScore(
    sensors.cameraColorK,
    IDEAL.cameraColorK.min,
    IDEAL.cameraColorK.max,
    SENSOR_INPUT_SCHEMA.cameraColorK.min,
    SENSOR_INPUT_SCHEMA.cameraColorK.max
  );
  const acousticScore = centeredScore(
    sensors.acousticDb,
    IDEAL.acousticDb.min,
    IDEAL.acousticDb.max,
    SENSOR_INPUT_SCHEMA.acousticDb.min,
    SENSOR_INPUT_SCHEMA.acousticDb.max
  );
  const thermalScore = centeredScore(
    sensors.temperatureC,
    IDEAL.temperatureC.min,
    IDEAL.temperatureC.max,
    SENSOR_INPUT_SCHEMA.temperatureC.min,
    SENSOR_INPUT_SCHEMA.temperatureC.max
  );

  const stability = clamp(lightScore * 0.24 + colorScore * 0.2 + acousticScore * 0.28 + thermalScore * 0.28);
  const noisePenalty = clamp((sensors.acousticDb - 40) * 2.2, 0, 100);
  const thermalPenalty = clamp(Math.abs(sensors.temperatureC - 24.5) * 7, 0, 100);
  const volatility = std(history.slice(-15).map((p) => p.derived.stability));

  const hazardIndex = clamp((100 - stability) * 0.6 + noisePenalty * 0.2 + thermalPenalty * 0.12 + volatility * 1.2);
  const signalQuality = clamp(colorScore * 0.56 + lightScore * 0.44);

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
  const angleDeg = clamp(88 + (sensors.lightLux - 520) * 0.05 - (sensors.acousticDb - 35) * 0.55, 8, 172);
  const lightHue = clamp(210 - (sensors.cameraColorK - 3000) / 25 + (derived.hazardIndex - 50) * 0.25, 0, 360);
  const lightFrequencyHz = Number((clamp(0.8 + derived.hazardIndex * 0.045, 0.2, 8.8) / 1).toFixed(2));
  const pumpSpeedPct = clamp(38 + (sensors.temperatureC - 24) * 3.4 + derived.hazardIndex * 0.42, 5, 100);

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
  return {
    thermalTolerance: clamp(52 + (24.5 - sensors.temperatureC) * 4 + derived.stability * 0.22),
    acousticShielding: clamp(34 + sensors.acousticDb * 0.7 + derived.hazardIndex * 0.22),
    photonicAdaptation: clamp(40 + (100 - Math.abs(sensors.lightLux - 520) / 6) * 0.5 + derived.signalQuality * 0.24),
    chromaticSensitivity: clamp(30 + (7200 - sensors.cameraColorK) * 0.012 + derived.signalQuality * 0.48),
    fluidRegulation: clamp(45 + derived.hazardIndex * 0.35 + (sensors.temperatureC - 24) * 2.4),
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
      lightLux: SENSOR_INPUT_SCHEMA.lightLux.meaning,
      cameraColorK: SENSOR_INPUT_SCHEMA.cameraColorK.meaning,
      acousticDb: SENSOR_INPUT_SCHEMA.acousticDb.meaning,
      temperatureC: SENSOR_INPUT_SCHEMA.temperatureC.meaning,
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
    lightLux: 520,
    cameraColorK: 5400,
    acousticDb: 34.5,
    temperatureC: 24.2,
  };
}

export function simulateSensorStep(prev: SensorInput): SensorInput {
  const jitter = (v: number, span: number) => v + (Math.random() - 0.5) * span;

  const next: SensorInput = {
    lightLux: clamp(jitter(prev.lightLux, 36), SENSOR_INPUT_SCHEMA.lightLux.min, SENSOR_INPUT_SCHEMA.lightLux.max),
    cameraColorK: clamp(jitter(prev.cameraColorK, 140), SENSOR_INPUT_SCHEMA.cameraColorK.min, SENSOR_INPUT_SCHEMA.cameraColorK.max),
    acousticDb: clamp(jitter(prev.acousticDb, 3.2), SENSOR_INPUT_SCHEMA.acousticDb.min, SENSOR_INPUT_SCHEMA.acousticDb.max),
    temperatureC: clamp(jitter(prev.temperatureC, 0.8), SENSOR_INPUT_SCHEMA.temperatureC.min, SENSOR_INPUT_SCHEMA.temperatureC.max),
  };

  if (Math.random() > 0.95) next.acousticDb = clamp(next.acousticDb + 7, SENSOR_INPUT_SCHEMA.acousticDb.min, SENSOR_INPUT_SCHEMA.acousticDb.max);
  if (Math.random() > 0.965) next.temperatureC = clamp(next.temperatureC + 2.4, SENSOR_INPUT_SCHEMA.temperatureC.min, SENSOR_INPUT_SCHEMA.temperatureC.max);
  if (Math.random() > 0.97) next.lightLux = clamp(next.lightLux - 100, SENSOR_INPUT_SCHEMA.lightLux.min, SENSOR_INPUT_SCHEMA.lightLux.max);

  return {
    lightLux: Number(next.lightLux.toFixed(1)),
    cameraColorK: Number(next.cameraColorK.toFixed(0)),
    acousticDb: Number(next.acousticDb.toFixed(1)),
    temperatureC: Number(next.temperatureC.toFixed(1)),
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
