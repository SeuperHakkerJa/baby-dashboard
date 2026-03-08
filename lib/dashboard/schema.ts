import type { ActuatorOutput, SensorInput, SurvivalThresholds } from "./types";

export const SENSOR_INPUT_SCHEMA: Record<
  keyof SensorInput,
  {
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    meaning: string;
  }
> = {
  temperatureF: {
    label: "Temperature",
    unit: "°F",
    min: 0,
    max: 140,
    step: 0.1,
    meaning: "Ambient surrounding temperature in Fahrenheit.",
  },
  humidityPct: {
    label: "Humidity",
    unit: "%",
    min: 0,
    max: 100,
    step: 0.1,
    meaning: "Relative humidity percentage measured from the environment.",
  },
  lightLevel: {
    label: "Light",
    unit: "lx",
    min: 0,
    max: 4095,
    step: 1,
    meaning: "Ambient light sensor reading from the Arduino payload.",
  },
};

export const ACTUATOR_OUTPUT_SCHEMA: Record<
  keyof ActuatorOutput,
  {
    label: string;
    unit: string;
    min: number;
    max: number;
    meaning: string;
  }
> = {
  angleDeg: {
    label: "Angle",
    unit: "°",
    min: 0,
    max: 180,
    meaning: "Mother chassis orientation to optimize exposure and reduce stressors.",
  },
  lightHue: {
    label: "Light Color",
    unit: "hue",
    min: 0,
    max: 360,
    meaning: "Emitted light hue for camouflage, signaling, or local regulation.",
  },
  lightFrequencyHz: {
    label: "Light Frequency",
    unit: "Hz",
    min: 0.2,
    max: 9,
    meaning: "Pulse frequency for signaling rhythm and local behavioral modulation.",
  },
  pumpSpeedPct: {
    label: "Pump Speed",
    unit: "%",
    min: 0,
    max: 100,
    meaning: "Circulation / cooling actuation to stabilize internal state.",
  },
};

export const DEFAULT_THRESHOLDS: SurvivalThresholds = {
  minStability: 68,
  maxHazard: 37,
  minModelConfidence: 60,
  minReadiness: 63,
  minForecastWindowMin: 10,
};

export const MODEL_OBJECTIVE =
  "Maximize offspring survival probability using sensor inputs, derived state, and controllable outputs while avoiding explanatory narrative.";
