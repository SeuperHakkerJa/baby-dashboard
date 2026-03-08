export type SensorInput = {
  temperatureF: number;
  humidityPct: number;
  lightLevel: number;
};

export type ActuatorOutput = {
  angleDeg: number;
  lightHue: number;
  lightFrequencyHz: number;
  pumpSpeedPct: number;
};

export type SurvivalThresholds = {
  minStability: number;
  maxHazard: number;
  minModelConfidence: number;
  minReadiness: number;
  minForecastWindowMin: number;
};

export type DerivedState = {
  stability: number;
  hazardIndex: number;
  signalQuality: number;
  trendSlope: number;
  forecastToUnsafeMin: number;
  modelConfidence: number;
  reproductiveReadiness: number;
  survivalProbability: number;
};

export type BirthDecision = {
  shouldBirth: boolean;
  triggerScore: number;
  windowMinutes: number;
  unsafeInMinutes: number;
  reasonCode: "READY" | "UNSTABLE" | "HIGH_HAZARD" | "LOW_CONFIDENCE" | "LOW_READINESS" | "SHORT_WINDOW";
};

export type GenomeAxis =
  | "thermalTolerance"
  | "acousticShielding"
  | "photonicAdaptation"
  | "chromaticSensitivity"
  | "fluidRegulation"
  | "orientationControl"
  | "sensorFusion"
  | "predictiveMemory"
  | "structuralFlex"
  | "stressRecovery"
  | "resourceFrugality"
  | "reserveCapacity";

export type GenomeVector = Record<GenomeAxis, number>;

export type HistoryPoint = {
  t: number;
  label: string;
  sensors: SensorInput;
  derived: DerivedState;
  survival: number;
};

export type BabyConfig = {
  generation: number;
  createdAt: string;
  objective: string;
  sensorMeaning: Record<keyof SensorInput, string>;
  actuatorControl: Record<keyof ActuatorOutput, string>;
  decision: BirthDecision;
  genome: GenomeVector;
  survivalEstimate: number;
};

export type PlannerPayload = {
  sensors: SensorInput;
  derived: DerivedState;
  actuators: ActuatorOutput;
  thresholds: SurvivalThresholds;
  history: Array<{
    label: string;
    stability: number;
    hazardIndex: number;
    survival: number;
  }>;
};

export type PlannerResponse = {
  shouldBirth: boolean;
  windowMinutes: number;
  confidence: number;
  babyConfig: BabyConfig;
};

export type ThemeName = "Obsidian" | "Cipher" | "Zenith" | "Lumen" | "Quartz" | "Tidal";

export type ThemeTokens = {
  name: ThemeName;
  canvas: string;
  mesh: string;
  panel: string;
  subpanel: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentAlt: string;
  chartA: string;
  chartB: string;
  chartC: string;
};

export type SensorKey = keyof SensorInput;
export type DerivedObjective = "maximize" | "minimize" | "none" | "monitor";

export type DerivedDefinition = {
  id: string;
  label: string;
  description: string;
  weights: Record<SensorKey, number>;
  bias: number;
  threshold: number;
  objective: DerivedObjective;
};

export type WorldModelSpec = {
  title: string;
  prompt: string;
  generatedAt: string;
  definitions: DerivedDefinition[];
};

export type WorldModelResponse = {
  source: "openai" | "local";
  model: WorldModelSpec;
  warning?: string;
  debug?: {
    provider: "openai" | "local";
    modelId: string;
    keySource?: "env.local" | "none";
    responseId?: string;
    latencyMs?: number;
    incompleteReason?: "max_output_tokens" | "content_filter" | null;
  };
};

export type BabyTraitMode = "balanced" | "heat-shield" | "sprint" | "conserve" | "stealth";

export type BabyTraitConfig = {
  speed: number;
  breathingRate: number;
  bodySize: number;
  mode: BabyTraitMode;
};

export type BabyDiscreteConfig = {
  pumpPower: 50 | 75 | 100;
  microServoAngle: -90 | -45 | 0 | 45 | 90;
  lightColor: "red" | "green" | "blue";
};

export type BabyRealizedProjection = {
  pumpPower: BabyDiscreteConfig["pumpPower"];
  microServoAngle: BabyDiscreteConfig["microServoAngle"];
  lightColor: BabyDiscreteConfig["lightColor"];
  explanation: {
    pumpPower: string;
    microServoAngle: string;
    lightColor: string;
  };
};

export type BabyRealizationConfig = {
  speed: { min: number; max: number; unit: "m/s" };
  breathingRate: { min: number; max: number; unit: "rpm" };
  bodySize: { min: number; max: number; unit: "cm" };
  allowedModes: readonly BabyTraitMode[];
  fallbackMode: BabyTraitMode;
};

export type BabySnapshot = {
  capturedAt: string;
  tick: number;
  hotSeconds: number;
  monitorThresholdF: number;
  sensors: SensorInput;
  derived: Array<{
    id: string;
    label: string;
    value: number;
    objective: DerivedObjective;
    threshold: number;
  }>;
};

export type BabyGenomeResponse = {
  source: "openai" | "local";
  snapshot: BabySnapshot;
  proposed: BabyTraitConfig;
  realizedTraits: BabyTraitConfig;
  realizedProjection: BabyRealizedProjection;
  warning?: string;
  debug?: {
    provider: "openai" | "local";
    modelId: string;
    keySource?: "env.local" | "none";
    responseId?: string;
    latencyMs?: number;
    incompleteReason?: "max_output_tokens" | "content_filter" | null;
  };
};

export type BabyGenomeRequest = {
  snapshot: BabySnapshot;
  forbiddenConfigs?: BabyDiscreteConfig[];
};
