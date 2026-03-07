import { clamp, rgbToHueDeg, sensorPercent } from "./pipeline";
import type { DerivedHistoryPoint, DerivedSnapshot } from "./pipeline";
import type { SensorInput, WorldModelSpec } from "./types";

export type ForecastState = {
  aggregate: number;
  hazard: number;
  volatility: number;
  slopePerMinute: number;
  forecastToUnsafeMin: number;
  modelCapability: number;
  birthReadiness: number;
  birthWindowOpen: boolean;
};

export type GenomeCandidate = {
  createdAt: string;
  objective: string;
  sourceModel: string;
  prompt: string;
  readiness: number;
  hazard: number;
  forecastToUnsafeMin: number;
  axes: Record<string, number>;
};

const HAZARD_LIMIT = 46;
const READINESS_LIMIT = 73;
const MODEL_CAPABILITY_LIMIT = 60;
const FORECAST_LIMIT = 8;

function objectiveScore(item: DerivedSnapshot) {
  if (item.objective === "maximize") return item.value;
  if (item.objective === "minimize") return 100 - item.value;
  return 50;
}

export function aggregateScore(snapshot: DerivedSnapshot[]) {
  if (snapshot.length === 0) return 0;
  const total = snapshot.reduce((sum, item) => sum + objectiveScore(item), 0);
  return clamp(total / snapshot.length);
}

function std(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function slope(values: number[]) {
  if (values.length < 3) return 0;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / n;

  let num = 0;
  let den = 0;

  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }

  if (den === 0) return 0;
  return num / den;
}

export function evaluateWorldModel(history: DerivedHistoryPoint[], snapshot: DerivedSnapshot[]): ForecastState {
  const aggregate = Number(aggregateScore(snapshot).toFixed(1));
  const aggregateHistory = history.slice(-48).map((point) => point.aggregate);
  const volatility = Number(std(aggregateHistory).toFixed(2));
  const slopePerMinute = Number((slope(aggregateHistory) * 60).toFixed(2));

  let forecastToUnsafeMin = 45;
  if (slopePerMinute < -0.25) {
    const delta = Math.max(aggregate - HAZARD_LIMIT, 0.1);
    forecastToUnsafeMin = clamp(delta / Math.abs(slopePerMinute), 1, 45);
  }

  const hazard = Number(clamp((100 - aggregate) * 0.68 + volatility * 1.1).toFixed(1));
  const modelCapability = Number(
    clamp(aggregate * 0.56 + (100 - hazard) * 0.26 + clamp((history.length / 180) * 100) * 0.18).toFixed(1)
  );
  const birthReadiness = Number(
    clamp(aggregate * 0.44 + modelCapability * 0.28 + (100 - hazard) * 0.2 + clamp(forecastToUnsafeMin * 2.2) * 0.08).toFixed(1)
  );

  return {
    aggregate,
    hazard,
    volatility,
    slopePerMinute,
    forecastToUnsafeMin: Number(forecastToUnsafeMin.toFixed(1)),
    modelCapability,
    birthReadiness,
    birthWindowOpen:
      birthReadiness >= READINESS_LIMIT &&
      hazard <= HAZARD_LIMIT &&
      modelCapability >= MODEL_CAPABILITY_LIMIT &&
      forecastToUnsafeMin >= FORECAST_LIMIT,
  };
}

function weightedWorldState(snapshot: DerivedSnapshot[], id: string) {
  const value = snapshot.find((item) => item.id === id)?.value ?? 50;
  return clamp(value);
}

export function synthesizeGenomeCandidate(
  model: WorldModelSpec,
  sensors: SensorInput,
  snapshot: DerivedSnapshot[],
  forecast: ForecastState
): GenomeCandidate {
  const thermal = sensorPercent("temperatureF", sensors.temperatureF);
  const acoustic = sensorPercent("acousticDb", sensors.acousticDb);
  const cameraR = sensorPercent("cameraR", sensors.cameraR);
  const cameraG = sensorPercent("cameraG", sensors.cameraG);
  const cameraB = sensorPercent("cameraB", sensors.cameraB);
  const chroma = (cameraR + cameraG + cameraB) / 3;
  const hue = clamp(rgbToHueDeg(sensors.cameraR, sensors.cameraG, sensors.cameraB) / 3.6);

  const stateA = weightedWorldState(snapshot, model.definitions[0]?.id ?? "");
  const stateB = weightedWorldState(snapshot, model.definitions[1]?.id ?? "");
  const stateC = weightedWorldState(snapshot, model.definitions[2]?.id ?? "");

  const axes = {
    thermalTolerance: clamp(36 + thermal * 0.48 + forecast.birthReadiness * 0.32 - forecast.hazard * 0.12),
    acousticShielding: clamp(28 + acoustic * 0.72 + forecast.hazard * 0.25),
    photonicAdaptation: clamp(32 + hue * 0.56 + stateA * 0.28),
    chromaticSensitivity: clamp(34 + chroma * 0.44 + stateB * 0.34),
    fluidRegulation: clamp(42 + thermal * 0.4 + forecast.hazard * 0.24),
    orientationControl: clamp(44 + stateC * 0.42 + forecast.modelCapability * 0.24),
    sensorFusion: clamp(30 + stateA * 0.3 + stateB * 0.3 + stateC * 0.26),
    predictiveMemory: clamp(24 + forecast.modelCapability * 0.6 + Math.max(0, -forecast.slopePerMinute) * 2.2),
    structuralFlex: clamp(38 + forecast.aggregate * 0.32 + (100 - forecast.hazard) * 0.2),
    stressRecovery: clamp(26 + (100 - forecast.hazard) * 0.46 + forecast.forecastToUnsafeMin * 0.9),
  };

  const normalizedAxes: Record<string, number> = {};
  for (const [key, value] of Object.entries(axes)) {
    normalizedAxes[key] = Number(value.toFixed(1));
  }

  return {
    createdAt: new Date().toISOString(),
    objective: "Maximize offspring survival under current world-state model.",
    sourceModel: model.title,
    prompt: model.prompt,
    readiness: forecast.birthReadiness,
    hazard: forecast.hazard,
    forecastToUnsafeMin: forecast.forecastToUnsafeMin,
    axes: normalizedAxes,
  };
}
