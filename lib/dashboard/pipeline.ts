import { SENSOR_INPUT_SCHEMA } from "./schema";
import type { DerivedDefinition, SensorInput, SensorKey, WorldModelSpec } from "./types";

const SENSOR_KEYS: SensorKey[] = ["lightLux", "cameraColorK", "acousticDb", "temperatureC"];
const HISTORY_LIMIT = 180;

export type RawHistoryPoint = {
  label: string;
  sensors: SensorInput;
};

export type DerivedHistoryPoint = {
  label: string;
  values: Record<string, number>;
  aggregate: number;
};

export type DerivedSnapshot = {
  id: string;
  label: string;
  description: string;
  value: number;
  objective: "maximize" | "minimize";
  formula: string;
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function sensorPercent(sensor: SensorKey, value: number) {
  const schema = SENSOR_INPUT_SCHEMA[sensor];
  const raw = ((value - schema.min) / (schema.max - schema.min)) * 100;
  return clamp(raw);
}

export function initialSensors(): SensorInput {
  return {
    lightLux: 520,
    cameraColorK: 5400,
    acousticDb: 34,
    temperatureC: 24.1,
  };
}

export function simulateSensorStep(prev: SensorInput): SensorInput {
  const jitter = (v: number, span: number) => v + (Math.random() - 0.5) * span;

  const next: SensorInput = {
    lightLux: clamp(jitter(prev.lightLux, 38), SENSOR_INPUT_SCHEMA.lightLux.min, SENSOR_INPUT_SCHEMA.lightLux.max),
    cameraColorK: clamp(jitter(prev.cameraColorK, 160), SENSOR_INPUT_SCHEMA.cameraColorK.min, SENSOR_INPUT_SCHEMA.cameraColorK.max),
    acousticDb: clamp(jitter(prev.acousticDb, 3.2), SENSOR_INPUT_SCHEMA.acousticDb.min, SENSOR_INPUT_SCHEMA.acousticDb.max),
    temperatureC: clamp(jitter(prev.temperatureC, 0.9), SENSOR_INPUT_SCHEMA.temperatureC.min, SENSOR_INPUT_SCHEMA.temperatureC.max),
  };

  if (Math.random() > 0.95) next.acousticDb = clamp(next.acousticDb + 7, SENSOR_INPUT_SCHEMA.acousticDb.min, SENSOR_INPUT_SCHEMA.acousticDb.max);
  if (Math.random() > 0.965) next.temperatureC = clamp(next.temperatureC + 2.2, SENSOR_INPUT_SCHEMA.temperatureC.min, SENSOR_INPUT_SCHEMA.temperatureC.max);
  if (Math.random() > 0.97) next.lightLux = clamp(next.lightLux - 90, SENSOR_INPUT_SCHEMA.lightLux.min, SENSOR_INPUT_SCHEMA.lightLux.max);

  return {
    lightLux: Number(next.lightLux.toFixed(1)),
    cameraColorK: Number(next.cameraColorK.toFixed(0)),
    acousticDb: Number(next.acousticDb.toFixed(1)),
    temperatureC: Number(next.temperatureC.toFixed(1)),
  };
}

export function timeLabel(index: number) {
  const minute = Math.floor(index / 60);
  const second = index % 60;
  return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function weightedScore(sensors: SensorInput, definition: DerivedDefinition) {
  let score = definition.bias;

  for (const key of SENSOR_KEYS) {
    score += sensorPercent(key, sensors[key]) * definition.weights[key];
  }

  return clamp(score);
}

export function formulaText(definition: DerivedDefinition) {
  const parts: string[] = [];

  for (const key of SENSOR_KEYS) {
    const weight = definition.weights[key];
    const sign = weight >= 0 ? "+" : "-";
    parts.push(`${sign} ${Math.abs(weight).toFixed(2)}*${key}%`);
  }

  const bias = definition.bias >= 0 ? ` + ${definition.bias.toFixed(1)}` : ` - ${Math.abs(definition.bias).toFixed(1)}`;
  return `clamp(${parts.join(" ")}${bias}, 0, 100)`;
}

export function computeDerivedSnapshot(definitions: DerivedDefinition[], sensors: SensorInput): DerivedSnapshot[] {
  return definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    description: definition.description,
    value: Number(weightedScore(sensors, definition).toFixed(1)),
    objective: definition.objective,
    formula: formulaText(definition),
  }));
}

export function pushRawHistory(history: RawHistoryPoint[], point: RawHistoryPoint) {
  return [...history.slice(-(HISTORY_LIMIT - 1)), point];
}

export function pushDerivedHistory(history: DerivedHistoryPoint[], point: DerivedHistoryPoint) {
  return [...history.slice(-(HISTORY_LIMIT - 1)), point];
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashPrompt(prompt: string) {
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i += 1) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const DEFAULT_LABELS = [
  "Signal Coherence",
  "Thermal Margin",
  "Noise Pressure",
  "Photonic Drift",
  "System Poise",
  "Stability Potential",
  "Forecast Integrity",
  "Environmental Fit",
] as const;

export function buildLocalWorldModel(prompt: string): WorldModelSpec {
  const seed = hashPrompt(prompt || "default world model");
  const rnd = seeded(seed);

  const count = 4 + Math.floor(rnd() * 3);
  const labels = [...DEFAULT_LABELS].sort(() => rnd() - 0.5).slice(0, count);

  const definitions: DerivedDefinition[] = labels.map((label, index) => {
    const weights: Record<SensorKey, number> = {
      lightLux: Number((rnd() * 1.3 - 0.25).toFixed(2)),
      cameraColorK: Number((rnd() * 1.1 - 0.2).toFixed(2)),
      acousticDb: Number((rnd() * -1.1).toFixed(2)),
      temperatureC: Number((rnd() * 1.2 - 0.25).toFixed(2)),
    };

    return {
      id: `ws_${index + 1}`,
      label,
      description: `Derived scalar used by the model to monitor ${label.toLowerCase()}.`,
      weights,
      bias: Number((18 + rnd() * 24).toFixed(1)),
      objective: rnd() > 0.22 ? "maximize" : "minimize",
    };
  });

  return {
    title: "Prompt-Tuned World Model",
    prompt,
    generatedAt: new Date().toISOString(),
    definitions,
  };
}

function safeId(raw: string, index: number) {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return cleaned ? `ws_${cleaned}` : `ws_${index + 1}`;
}

export function sanitizeWorldModel(raw: unknown, prompt: string, fallback: WorldModelSpec): WorldModelSpec {
  if (!raw || typeof raw !== "object") return fallback;

  const obj = raw as Record<string, unknown>;
  const definitionsRaw = Array.isArray(obj.definitions) ? obj.definitions : null;
  if (!definitionsRaw || definitionsRaw.length < 4) return fallback;

  const definitions: DerivedDefinition[] = definitionsRaw
    .slice(0, 6)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const def = item as Record<string, unknown>;
      const weightsRaw = def.weights as Record<string, unknown>;

      const weights: Record<SensorKey, number> = {
        lightLux: Number(weightsRaw?.lightLux ?? 0),
        cameraColorK: Number(weightsRaw?.cameraColorK ?? 0),
        acousticDb: Number(weightsRaw?.acousticDb ?? 0),
        temperatureC: Number(weightsRaw?.temperatureC ?? 0),
      };

      for (const key of SENSOR_KEYS) {
        if (!Number.isFinite(weights[key])) weights[key] = 0;
        weights[key] = Number(clamp(weights[key], -1.5, 1.5).toFixed(2));
      }

      const biasRaw = Number(def.bias ?? 0);
      const bias = Number((Number.isFinite(biasRaw) ? biasRaw : 0).toFixed(1));

      const objective = def.objective === "minimize" ? "minimize" : "maximize";

      return {
        id: safeId(String(def.id ?? def.label ?? `state_${index + 1}`), index),
        label: String(def.label ?? `State ${index + 1}`),
        description: String(def.description ?? "Derived model variable."),
        weights,
        bias,
        objective,
      } as DerivedDefinition;
    })
    .filter((item): item is DerivedDefinition => item !== null);

  if (definitions.length < 4) return fallback;

  return {
    title: typeof obj.title === "string" ? obj.title : fallback.title,
    prompt,
    generatedAt: new Date().toISOString(),
    definitions,
  };
}
