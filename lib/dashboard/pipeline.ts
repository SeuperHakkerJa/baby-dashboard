import { SENSOR_INPUT_SCHEMA } from "./schema";
import type { DerivedDefinition, SensorInput, SensorKey, WorldModelSpec } from "./types";

const SENSOR_KEYS: SensorKey[] = ["temperatureF", "cameraR", "cameraG", "cameraB", "acousticDb"];
const HISTORY_LIMIT = 180;

const FIXED_SURROUNDING_TEMP_ID = "fixed_surrounding_temperature";
const FIXED_HUE_ID = "fixed_hue";

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
  threshold: number;
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

export function rgbToHueDeg(r: number, g: number, b: number) {
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

export function cameraRgbPercent(sensors: SensorInput) {
  return Number(
    (
      (sensorPercent("cameraR", sensors.cameraR) +
        sensorPercent("cameraG", sensors.cameraG) +
        sensorPercent("cameraB", sensors.cameraB)) /
      3
    ).toFixed(1)
  );
}

export function initialSensors(): SensorInput {
  return {
    temperatureF: 74.2,
    cameraR: 152,
    cameraG: 173,
    cameraB: 204,
    acousticDb: 34,
  };
}

export function simulateSensorStep(prev: SensorInput): SensorInput {
  const jitter = (v: number, span: number) => v + (Math.random() - 0.5) * span;

  const next: SensorInput = {
    temperatureF: clamp(jitter(prev.temperatureF, 1.6), SENSOR_INPUT_SCHEMA.temperatureF.min, SENSOR_INPUT_SCHEMA.temperatureF.max),
    cameraR: clamp(jitter(prev.cameraR, 18), SENSOR_INPUT_SCHEMA.cameraR.min, SENSOR_INPUT_SCHEMA.cameraR.max),
    cameraG: clamp(jitter(prev.cameraG, 18), SENSOR_INPUT_SCHEMA.cameraG.min, SENSOR_INPUT_SCHEMA.cameraG.max),
    cameraB: clamp(jitter(prev.cameraB, 18), SENSOR_INPUT_SCHEMA.cameraB.min, SENSOR_INPUT_SCHEMA.cameraB.max),
    acousticDb: clamp(jitter(prev.acousticDb, 3.2), SENSOR_INPUT_SCHEMA.acousticDb.min, SENSOR_INPUT_SCHEMA.acousticDb.max),
  };

  if (Math.random() > 0.95) next.acousticDb = clamp(next.acousticDb + 7, SENSOR_INPUT_SCHEMA.acousticDb.min, SENSOR_INPUT_SCHEMA.acousticDb.max);
  if (Math.random() > 0.965) next.temperatureF = clamp(next.temperatureF + 3.4, SENSOR_INPUT_SCHEMA.temperatureF.min, SENSOR_INPUT_SCHEMA.temperatureF.max);
  if (Math.random() > 0.97) {
    next.cameraR = clamp(next.cameraR + 24, SENSOR_INPUT_SCHEMA.cameraR.min, SENSOR_INPUT_SCHEMA.cameraR.max);
    next.cameraB = clamp(next.cameraB - 20, SENSOR_INPUT_SCHEMA.cameraB.min, SENSOR_INPUT_SCHEMA.cameraB.max);
  }

  return {
    temperatureF: Number(next.temperatureF.toFixed(1)),
    cameraR: Number(next.cameraR.toFixed(0)),
    cameraG: Number(next.cameraG.toFixed(0)),
    cameraB: Number(next.cameraB.toFixed(0)),
    acousticDb: Number(next.acousticDb.toFixed(1)),
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

function fixedDerivedValue(definitionId: string, sensors: SensorInput) {
  if (definitionId === FIXED_SURROUNDING_TEMP_ID) {
    return Number(sensors.temperatureF.toFixed(1));
  }

  if (definitionId === FIXED_HUE_ID) {
    const hueDeg = rgbToHueDeg(sensors.cameraR, sensors.cameraG, sensors.cameraB);
    return Number((hueDeg / 3.6).toFixed(1));
  }

  return null;
}

export function formulaText(definition: DerivedDefinition) {
  if (definition.id === FIXED_SURROUNDING_TEMP_ID) {
    return "surroundingTemperature = temperatureF";
  }

  if (definition.id === FIXED_HUE_ID) {
    return "hue = rgbToHueDeg(cameraR,cameraG,cameraB) / 3.6";
  }

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
  return definitions.map((definition) => {
    const fixedValue = fixedDerivedValue(definition.id, sensors);

    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      value: fixedValue == null ? Number(weightedScore(sensors, definition).toFixed(1)) : fixedValue,
      threshold: definition.threshold,
      objective: definition.objective,
      formula: formulaText(definition),
    };
  });
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
  "Visual Drift",
  "System Poise",
  "Stability Potential",
  "Forecast Integrity",
  "Environmental Fit",
] as const;

const FIXED_DERIVED_DEFINITIONS: DerivedDefinition[] = [
  {
    id: FIXED_SURROUNDING_TEMP_ID,
    label: "Surrounding Temperature",
    description: "Direct passthrough of measured surrounding temperature in Fahrenheit.",
    objective: "maximize",
    weights: {
      temperatureF: 0,
      cameraR: 0,
      cameraG: 0,
      cameraB: 0,
      acousticDb: 0,
    },
    bias: 0,
    threshold: 84,
  },
  {
    id: FIXED_HUE_ID,
    label: "Hue",
    description: "HSV hue computed from camera RGB and normalized to 0..100.",
    objective: "maximize",
    weights: {
      temperatureF: 0,
      cameraR: 0,
      cameraG: 0,
      cameraB: 0,
      acousticDb: 0,
    },
    bias: 0,
    threshold: 78,
  },
];

function withFixedDerivedDefinitions(definitions: DerivedDefinition[]) {
  const fixedIds = new Set(FIXED_DERIVED_DEFINITIONS.map((item) => item.id));
  const filtered = definitions.filter((item) => !fixedIds.has(item.id));
  return [...filtered, ...FIXED_DERIVED_DEFINITIONS];
}

export function buildLocalWorldModel(prompt: string): WorldModelSpec {
  const seed = hashPrompt(prompt || "default world model");
  const rnd = seeded(seed);

  const count = 3 + Math.floor(rnd() * 2);
  const labels = [...DEFAULT_LABELS].sort(() => rnd() - 0.5).slice(0, count);

  const generated: DerivedDefinition[] = labels.map((label, index) => {
    const weights: Record<SensorKey, number> = {
      temperatureF: Number((rnd() * 1.2 - 0.2).toFixed(2)),
      cameraR: Number((rnd() * 1.3 - 0.25).toFixed(2)),
      cameraG: Number((rnd() * 1.3 - 0.25).toFixed(2)),
      cameraB: Number((rnd() * 1.3 - 0.25).toFixed(2)),
      acousticDb: Number((rnd() * -1.1).toFixed(2)),
    };

    return {
      id: `ws_${index + 1}`,
      label,
      description: `Derived scalar used by the model to monitor ${label.toLowerCase()}.`,
      weights,
      bias: Number((18 + rnd() * 24).toFixed(1)),
      threshold: Number((56 + rnd() * 28).toFixed(1)),
      objective: rnd() > 0.22 ? "maximize" : "minimize",
    };
  });

  return {
    title: "Prompt-Tuned World Model",
    prompt,
    generatedAt: new Date().toISOString(),
    definitions: withFixedDerivedDefinitions(generated),
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
  if (!definitionsRaw || definitionsRaw.length < 3) return fallback;

  const generated: DerivedDefinition[] = definitionsRaw
    .slice(0, 4)
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const def = item as Record<string, unknown>;
      const weightsRaw = def.weights as Record<string, unknown>;

      const weights: Record<SensorKey, number> = {
        temperatureF: Number(weightsRaw?.temperatureF ?? 0),
        cameraR: Number(weightsRaw?.cameraR ?? 0),
        cameraG: Number(weightsRaw?.cameraG ?? 0),
        cameraB: Number(weightsRaw?.cameraB ?? 0),
        acousticDb: Number(weightsRaw?.acousticDb ?? 0),
      };

      for (const key of SENSOR_KEYS) {
        if (!Number.isFinite(weights[key])) weights[key] = 0;
        weights[key] = Number(clamp(weights[key], -1.5, 1.5).toFixed(2));
      }

      const biasRaw = Number(def.bias ?? 0);
      const bias = Number(clamp(Number.isFinite(biasRaw) ? biasRaw : 0, 0, 60).toFixed(1));
      const thresholdRaw = Number(def.threshold ?? 70);
      const threshold = Number(clamp(Number.isFinite(thresholdRaw) ? thresholdRaw : 70, 0, 100).toFixed(1));

      const objective = def.objective === "minimize" ? "minimize" : "maximize";

      return {
        id: safeId(String(def.id ?? def.label ?? `state_${index + 1}`), index),
        label: String(def.label ?? `State ${index + 1}`),
        description: String(def.description ?? "Derived model variable."),
        weights,
        bias,
        threshold,
        objective,
      } as DerivedDefinition;
    })
    .filter((item): item is DerivedDefinition => item !== null);

  if (generated.length < 3) return fallback;

  return {
    title: typeof obj.title === "string" ? obj.title : fallback.title,
    prompt,
    generatedAt: new Date().toISOString(),
    definitions: withFixedDerivedDefinitions(generated),
  };
}
