import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AudioLines,
  Baby,
  Bone,
  Bot,
  Brain,
  Cpu,
  Dna,
  Droplets,
  Gauge,
  HeartPulse,
  Orbit,
  Rabbit,
  ScanLine,
  ScrollText,
  Shield,
  Sparkles,
  Thermometer,
  Users,
  Waves,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type EnvState = {
  temperature: number;
  humidity: number;
  sound: number;
  crowd: number;
  pressure: number;
};

type Genome = {
  bodySize: number;
  boneDensity: number;
  shellFlex: number;
  sensorDensity: number;
  energyReserve: number;
  curiosity: number;
  caution: number;
  sociability: number;
  limbLength: number;
  signalIntensity: number;
  boneStructure: "lattice" | "spiral" | "dense" | "segmented" | "hollow";
  surfaceType: "matte" | "porous" | "adaptive-mesh" | "soft-shell" | "reflective";
  locomotion: "roller" | "crawler" | "multi-leg" | "hopper" | "glider";
  temperament: "curious" | "shy" | "cooperative" | "defensive" | "playful";
};

type Derived = {
  stability: number;
  volatility: number;
  attentionRisk: number;
  stealthNeed: number;
  viability: number;
  adaptation: number;
  intelligence: number;
  resilience: number;
  agility: number;
  stealth: number;
  social: number;
  biome: string;
  classLabel: string;
  recommendations: {
    size: string;
    bone: string;
    motion: string;
    signal: string;
  };
};

type Vitals = {
  breathingRate: number;
  pulseRate: number;
  metabolicLoad: number;
  wombPressure: number;
};

type Candidate = {
  id: string;
  name: string;
  score: number;
  classLabel: string;
  rationale: string;
  mutations: string[];
};

type AIResponse = {
  summary: string;
  hiddenBeliefs: Array<{ label: string; value: number }>;
  candidates: Candidate[];
  chosenName: string;
  chosenReason: string;
};

type TimelinePoint = {
  t: string;
  temperature: number;
  humidity: number;
  sound: number;
  stability: number;
  viability: number;
  adaptation: number;
  breathingRate: number;
  pulseRate: number;
};

type LogItem = {
  id: string;
  time: string;
  level: "INFO" | "EVENT" | "WARN" | "MODEL";
  text: string;
};

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => Math.random().toString(36).slice(2, 9);
const stamp = () => new Date().toLocaleTimeString();

const QUAL = {
  boneStructure: ["lattice", "spiral", "dense", "segmented", "hollow"] as const,
  surfaceType: ["matte", "porous", "adaptive-mesh", "soft-shell", "reflective"] as const,
  locomotion: ["roller", "crawler", "multi-leg", "hopper", "glider"] as const,
  temperament: ["curious", "shy", "cooperative", "defensive", "playful"] as const,
};

const INITIAL_ENV: EnvState = {
  temperature: 24.5,
  humidity: 56,
  sound: 38,
  crowd: 42,
  pressure: 61,
};

const INITIAL_GENOME: Genome = {
  bodySize: 58,
  boneDensity: 62,
  shellFlex: 67,
  sensorDensity: 73,
  energyReserve: 58,
  curiosity: 70,
  caution: 47,
  sociability: 54,
  limbLength: 45,
  signalIntensity: 37,
  boneStructure: "lattice",
  surfaceType: "adaptive-mesh",
  locomotion: "roller",
  temperament: "curious",
};

function scoreEnvironment(env: EnvState) {
  const temperatureScore = clamp(100 - Math.abs(env.temperature - 23.5) * 7.1);
  const humidityScore = clamp(100 - Math.abs(env.humidity - 54) * 2.6);
  const soundScore = clamp(100 - Math.abs(env.sound - 28) * 1.45);
  const crowdScore = clamp(100 - Math.abs(env.crowd - 35) * 1.25);
  const pressureScore = clamp(100 - Math.abs(env.pressure - 60) * 2.0);

  const stability = clamp(
    temperatureScore * 0.25 +
      humidityScore * 0.2 +
      soundScore * 0.25 +
      crowdScore * 0.14 +
      pressureScore * 0.16
  );

  const volatility = clamp(
    (100 - temperatureScore) * 0.2 +
      (100 - humidityScore) * 0.16 +
      (100 - soundScore) * 0.31 +
      (100 - crowdScore) * 0.17 +
      (100 - pressureScore) * 0.16
  );

  const biome = stability > 82 ? "supportive" : stability > 68 ? "adaptive" : stability > 50 ? "fragile" : "hostile";
  const attentionRisk = clamp(env.sound * 0.5 + env.crowd * 0.5);
  const stealthNeed = clamp(attentionRisk * 0.72 + volatility * 0.28);

  return { stability, volatility, attentionRisk, stealthNeed, biome };
}

function scoreGenomeFit(env: EnvState, genome: Genome) {
  const bodyTarget = env.temperature > 27 ? 38 : env.temperature < 20 ? 72 : 56;
  const shellTarget = env.humidity > 60 ? 76 : env.humidity < 40 ? 44 : 60;
  const cautionTarget = env.sound > 56 || env.crowd > 58 ? 78 : 46;
  const curiosityTarget = env.sound < 38 && env.crowd < 50 ? 74 : 49;
  const signalTarget = env.sound > 56 || env.crowd > 62 ? 18 : env.crowd < 30 ? 62 : 35;
  const densityTarget = env.pressure > 70 ? 76 : 58;

  const bodyFit = clamp(100 - Math.abs(genome.bodySize - bodyTarget) * 1.3);
  const shellFit = clamp(100 - Math.abs(genome.shellFlex - shellTarget) * 1.4);
  const cautionFit = clamp(100 - Math.abs(genome.caution - cautionTarget) * 1.15);
  const curiosityFit = clamp(100 - Math.abs(genome.curiosity - curiosityTarget) * 1.05);
  const signalFit = clamp(100 - Math.abs(genome.signalIntensity - signalTarget) * 1.55);
  const densityFit = clamp(100 - Math.abs(genome.boneDensity - densityTarget) * 1.1);
  const energyFit = clamp(100 - Math.abs(genome.energyReserve - (env.temperature < 20 ? 74 : 56)) * 1.05);

  const viability = clamp(
    bodyFit * 0.16 +
      shellFit * 0.16 +
      cautionFit * 0.16 +
      curiosityFit * 0.14 +
      signalFit * 0.16 +
      densityFit * 0.1 +
      energyFit * 0.12
  );

  const adaptation = clamp(
    genome.sensorDensity * 0.17 +
      genome.shellFlex * 0.11 +
      genome.energyReserve * 0.1 +
      cautionFit * 0.18 +
      curiosityFit * 0.16 +
      bodyFit * 0.14 +
      shellFit * 0.14
  );

  return {
    viability,
    adaptation,
    recommendations: {
      size: env.temperature > 27 ? "compact torso" : env.temperature < 20 ? "thermal bulk" : "balanced torso",
      bone: env.humidity > 64 ? "spiral bones" : env.sound > 58 ? "dense bones" : "lattice bones",
      motion: env.crowd > 60 ? "crawler gait" : env.sound < 35 ? "roller gait" : "multi-leg gait",
      signal: env.sound > 56 || env.crowd > 62 ? "quiet pulse" : "ambient glow",
    },
  };
}

function derive(env: EnvState, genome: Genome): Derived {
  const e = scoreEnvironment(env);
  const g = scoreGenomeFit(env, genome);

  const intelligence = clamp(genome.sensorDensity * 0.3 + genome.curiosity * 0.22 + e.stability * 0.22 + g.adaptation * 0.26);
  const resilience = clamp(genome.energyReserve * 0.24 + genome.boneDensity * 0.2 + genome.shellFlex * 0.18 + g.viability * 0.19 + g.adaptation * 0.19);
  const agility = clamp((100 - genome.bodySize) * 0.18 + genome.limbLength * 0.25 + genome.caution * 0.14 + genome.curiosity * 0.12 + (genome.locomotion === "hopper" ? 16 : genome.locomotion === "roller" ? 12 : genome.locomotion === "multi-leg" ? 10 : 6));
  const stealth = clamp((100 - genome.signalIntensity) * 0.34 + genome.caution * 0.18 + (genome.surfaceType === "matte" ? 16 : genome.surfaceType === "adaptive-mesh" ? 14 : 7) + e.stealthNeed * 0.24 + g.viability * 0.08);
  const social = clamp(genome.sociability * 0.48 + genome.signalIntensity * 0.16 + (genome.temperament === "cooperative" ? 18 : genome.temperament === "playful" ? 12 : 6) + env.crowd * 0.12 + (100 - env.sound) * 0.08);

  const classLabel =
    intelligence > 74 && agility > 60
      ? "Adaptive Scout"
      : resilience > 74 && stealth > 58
      ? "Fortress Forager"
      : social > 72
      ? "Choral Companion"
      : stealth > 76
      ? "Ghost Worker"
      : "Hybrid Drifter";

  return {
    stability: e.stability,
    volatility: e.volatility,
    attentionRisk: e.attentionRisk,
    stealthNeed: e.stealthNeed,
    viability: g.viability,
    adaptation: g.adaptation,
    intelligence,
    resilience,
    agility,
    stealth,
    social,
    biome: e.biome,
    classLabel,
    recommendations: g.recommendations,
  };
}

function deriveVitals(env: EnvState, d: Derived): Vitals {
  return {
    breathingRate: clamp(10 + env.sound * 0.22 + d.volatility * 0.08, 8, 36),
    pulseRate: clamp(62 + env.crowd * 0.32 + d.attentionRisk * 0.2, 58, 128),
    metabolicLoad: clamp(d.adaptation * 0.46 + (100 - d.stability) * 0.28 + env.temperature * 0.7, 12, 96),
    wombPressure: clamp(env.pressure * 0.65 + d.viability * 0.15 + env.humidity * 0.2, 10, 100),
  };
}

function fakeSensorStep(prev: EnvState): EnvState {
  const next = {
    temperature: clamp(prev.temperature + rand(-0.45, 0.45), 16, 34),
    humidity: clamp(prev.humidity + rand(-1.8, 1.8), 20, 88),
    sound: clamp(prev.sound + rand(-3.2, 3.2), 10, 95),
    crowd: clamp(prev.crowd + rand(-3.1, 3.1), 0, 100),
    pressure: clamp(prev.pressure + rand(-2.0, 2.0), 20, 95),
  };

  if (Math.random() > 0.94) next.sound = clamp(next.sound + rand(8, 18));
  if (Math.random() > 0.95) next.crowd = clamp(next.crowd + rand(10, 20));
  if (Math.random() > 0.96) next.humidity = clamp(next.humidity + rand(6, 12));

  return next;
}

function mutateGenome(base: Genome, env: EnvState): Genome {
  return {
    ...base,
    bodySize: clamp(base.bodySize + rand(-8, 8) + (env.temperature > 27 ? -5 : env.temperature < 20 ? 6 : 0)),
    boneDensity: clamp(base.boneDensity + rand(-10, 10) + (env.pressure > 70 ? 6 : 0)),
    shellFlex: clamp(base.shellFlex + rand(-10, 10) + (env.humidity > 60 ? 6 : env.humidity < 40 ? -6 : 0)),
    sensorDensity: clamp(base.sensorDensity + rand(-10, 10)),
    energyReserve: clamp(base.energyReserve + rand(-12, 12) + (env.temperature < 20 ? 5 : 0)),
    curiosity: clamp(base.curiosity + rand(-12, 12) + (env.sound < 40 ? 4 : -3)),
    caution: clamp(base.caution + rand(-12, 12) + (env.sound > 56 || env.crowd > 60 ? 9 : -2)),
    sociability: clamp(base.sociability + rand(-12, 12) + (env.crowd > 55 ? 5 : -2)),
    limbLength: clamp(base.limbLength + rand(-12, 12)),
    signalIntensity: clamp(base.signalIntensity + rand(-15, 15) + (env.sound > 56 || env.crowd > 62 ? -10 : 5)),
    boneStructure: Math.random() > 0.65 ? pick(QUAL.boneStructure) : base.boneStructure,
    surfaceType: Math.random() > 0.65 ? pick(QUAL.surfaceType) : base.surfaceType,
    locomotion: Math.random() > 0.65 ? pick(QUAL.locomotion) : base.locomotion,
    temperament: Math.random() > 0.65 ? pick(QUAL.temperament) : base.temperament,
  };
}

function fakeAI(env: EnvState, genome: Genome): AIResponse {
  const d = derive(env, genome);
  const candidates: Candidate[] = Array.from({ length: 3 }).map((_, index) => {
    const g = mutateGenome(genome, env);
    const dg = derive(env, g);
    return {
      id: uid(),
      name: ["Embryo Alpha", "Embryo Beta", "Embryo Gamma"][index],
      score: clamp(dg.viability * 0.56 + dg.intelligence * 0.14 + dg.resilience * 0.12 + dg.stealth * 0.09 + dg.social * 0.09),
      classLabel: dg.classLabel,
      rationale: `${dg.classLabel} tuned for a ${dg.biome} environment with ${Math.round(dg.viability)}% viability.`,
      mutations: [dg.recommendations.size, dg.recommendations.bone, dg.recommendations.motion, dg.recommendations.signal],
    };
  }).sort((a, b) => b.score - a.score);

  return {
    summary: `Mother model infers a ${d.biome} habitat with stability ${Math.round(d.stability)}% and volatility ${Math.round(d.volatility)}%. Attention risk is ${Math.round(d.attentionRisk)}%, so the planner biases toward ${d.stealthNeed > 62 ? "stealth, caution, and low-signature signaling" : "balanced exploration and moderate social signaling"}. Current embryo viability is ${Math.round(d.viability)}%. Recommended package: ${d.recommendations.size}, ${d.recommendations.bone}, ${d.recommendations.motion}, ${d.recommendations.signal}.`,
    hiddenBeliefs: [
      { label: "attention_risk", value: d.attentionRisk },
      { label: "stealth_need", value: d.stealthNeed },
      { label: "offspring_viability", value: d.viability },
      { label: "adaptation_pressure", value: d.adaptation },
      { label: "social_fragility", value: clamp(env.crowd * 0.5 + env.sound * 0.35 + (100 - d.stability) * 0.15) },
    ],
    candidates,
    chosenName: candidates[0].name,
    chosenReason: `${candidates[0].name} wins because it best balances viability, embodiment, and environmental fit under current attention pressure.`,
  };
}

async function requestAI(env: EnvState, genome: Genome): Promise<AIResponse> {
  const response = await fetch("/api/life3-reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env, genome }),
  });

  if (!response.ok) {
    throw new Error(`AI route failed with ${response.status}`);
  }

  return response.json();
}

function Panel({ title, subtitle, icon, right, children }: { title: string; subtitle?: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="flex items-start gap-3">
          {icon ? <div className="mt-0.5 text-cyan-300">{icon}</div> : null}
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-white/90">{title}</div>
            {subtitle ? <div className="mt-1 text-xs text-white/50">{subtitle}</div> : null}
          </div>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MetricTile({ title, value, suffix, icon, tone = "cyan" }: { title: string; value: number; suffix?: string; icon: React.ReactNode; tone?: "cyan" | "violet" | "emerald" | "amber" | "rose" }) {
  const tones = {
    cyan: "from-cyan-500/20 to-sky-500/5 border-cyan-400/20 text-cyan-200",
    violet: "from-violet-500/20 to-fuchsia-500/5 border-violet-400/20 text-violet-200",
    emerald: "from-emerald-500/20 to-teal-500/5 border-emerald-400/20 text-emerald-200",
    amber: "from-amber-500/20 to-yellow-500/5 border-amber-400/20 text-amber-200",
    rose: "from-rose-500/20 to-pink-500/5 border-rose-400/20 text-rose-200",
  }[tone];

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${tones} p-4`}>
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-white/60">
        <span>{title}</span>
        <span>{icon}</span>
      </div>
      <div className="text-3xl font-semibold text-white">
        {value.toFixed(value >= 100 ? 0 : 1)}
        {suffix ? <span className="ml-1 text-base text-white/50">{suffix}</span> : null}
      </div>
    </div>
  );
}

function SliderRow({ label, value, min = 0, max = 100, step = 1, onChange, accent = "cyan" }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (n: number) => void; accent?: "cyan" | "violet" | "emerald" | "amber" | "rose" }) {
  const accentClass = {
    cyan: "accent-cyan-400",
    violet: "accent-violet-400",
    emerald: "accent-emerald-400",
    amber: "accent-amber-400",
    rose: "accent-rose-400",
  }[accent];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-white/60">
        <span>{label}</span>
        <span className="text-white/85">{value.toFixed(1)}</span>
      </div>
      <input className={`w-full ${accentClass}`} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function SelectRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <label className="space-y-2 text-sm">
      <div className="text-xs uppercase tracking-[0.22em] text-white/60">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-white outline-none transition focus:border-cyan-400/50"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-slate-900">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-white/60">
        <span>{label}</span>
        <span className="text-white/85">{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400" style={{ width: `${Math.max(4, value)}%` }} />
      </div>
    </div>
  );
}

export default function Life3Dashboard() {
  const [env, setEnv] = useState<EnvState>(INITIAL_ENV);
  const [genome, setGenome] = useState<Genome>(INITIAL_GENOME);
  const [streaming, setStreaming] = useState(true);
  const [autoReason, setAutoReason] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [ai, setAi] = useState<AIResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [birthTick, setBirthTick] = useState(0);
  const aiTimer = useRef<number | null>(null);

  const derived = useMemo(() => derive(env, genome), [env, genome]);
  const vitals = useMemo(() => deriveVitals(env, derived), [env, derived]);

  const phenotypeRadar = useMemo(
    () => [
      { trait: "Intelligence", value: derived.intelligence },
      { trait: "Resilience", value: derived.resilience },
      { trait: "Agility", value: derived.agility },
      { trait: "Stealth", value: derived.stealth },
      { trait: "Social", value: derived.social },
      { trait: "Viability", value: derived.viability },
    ],
    [derived]
  );

  const hiddenBeliefsChart = useMemo(
    () => (ai?.hiddenBeliefs ?? []).map((item) => ({ name: item.label, value: item.value })),
    [ai]
  );

  function pushLog(level: LogItem["level"], text: string) {
    setLogs((prev) => [{ id: uid(), time: stamp(), level, text }, ...prev].slice(0, 30));
  }

  async function runReasoning(source: "auto" | "manual" | "birth") {
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await requestAI(env, genome);
      setAi(result);
      pushLog("MODEL", `AI world model updated via backend route (${source}). Selected ${result.chosenName}.`);
    } catch (error) {
      const fallback = fakeAI(env, genome);
      setAi(fallback);
      const message = error instanceof Error ? error.message : "Unknown AI error";
      setAiError(message);
      pushLog("WARN", `Backend reasoning unavailable, showing local fallback. ${message}`);
    } finally {
      setAiBusy(false);
    }
  }

  function createBaby() {
    setBirthTick((x) => x + 1);
    pushLog("EVENT", `Embryo compilation triggered. Phenotype class=${derived.classLabel}, viability=${Math.round(derived.viability)}%.`);
    setGenome((g) => ({
      ...g,
      bodySize: clamp(g.bodySize + (derived.recommendations.size.includes("compact") ? -5 : derived.recommendations.size.includes("thermal") ? 6 : 0)),
      boneStructure: derived.recommendations.bone.includes("spiral") ? "spiral" : derived.recommendations.bone.includes("dense") ? "dense" : "lattice",
      locomotion: derived.recommendations.motion.includes("crawler") ? "crawler" : derived.recommendations.motion.includes("roller") ? "roller" : "multi-leg",
      signalIntensity: clamp(g.signalIntensity + (derived.recommendations.signal.includes("quiet") ? -8 : 6)),
      caution: clamp(g.caution + (derived.stealthNeed > 60 ? 6 : -2)),
    }));
    void runReasoning("birth");
  }

  useEffect(() => {
    pushLog("INFO", "Dashboard initialized. Fake sensor bus online; AI route expected at /api/life3-reason.");
    void runReasoning("manual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!streaming) return;
    const id = window.setInterval(() => {
      setEnv((prev) => fakeSensorStep(prev));
    }, 900);
    return () => window.clearInterval(id);
  }, [streaming]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const point: TimelinePoint = {
        t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        temperature: Number(env.temperature.toFixed(1)),
        humidity: Number(env.humidity.toFixed(1)),
        sound: Number(env.sound.toFixed(1)),
        stability: Number(derived.stability.toFixed(1)),
        viability: Number(derived.viability.toFixed(1)),
        adaptation: Number(derived.adaptation.toFixed(1)),
        breathingRate: Number(vitals.breathingRate.toFixed(1)),
        pulseRate: Number(vitals.pulseRate.toFixed(1)),
      };
      setTimeline((prev) => [...prev.slice(-19), point]);
    }, 1000);
    return () => window.clearInterval(id);
  }, [env, derived, vitals]);

  useEffect(() => {
    if (!autoReason) return;
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    aiTimer.current = window.setTimeout(() => {
      void runReasoning("auto");
    }, 1200);
    return () => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, genome, autoReason]);

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute right-0 top-24 h-[28rem] w-[28rem] rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_45%)]" />
      </div>

      <div className="relative mx-auto max-w-[1680px] px-6 py-6">
        <motion.div
          key={birthTick}
          initial={{ opacity: 0.7, scale: 0.995 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-cyan-300">
                <ScanLine className="h-4 w-4" />
                Life 3.0 Reproductive Intelligence Interface
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Mother Robot World Model + Embryo Compiler</h1>
              <p className="mt-2 max-w-4xl text-sm text-white/60 md:text-base">
                Fake sensor stream, real dashboard, real AI reasoning path. The embodiment output is not wired yet — this board is the live decision theater.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[620px]">
              <button onClick={() => setStreaming((v) => !v)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10">
                {streaming ? "Pause stream" : "Resume stream"}
              </button>
              <button onClick={() => setAutoReason((v) => !v)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10">
                {autoReason ? "Auto AI: on" : "Auto AI: off"}
              </button>
              <button onClick={() => void runReasoning("manual")} className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-200 hover:bg-cyan-500/15">
                Run real AI now
              </button>
              <button onClick={createBaby} className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm font-medium text-violet-200 hover:bg-violet-500/15">
                Compile baby
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-white/65">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">stream {streaming ? "active" : "paused"}</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">AI {aiBusy ? "thinking" : aiError ? "fallback active" : "backend live"}</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">class {derived.classLabel}</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">biome {derived.biome}</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">viability {Math.round(derived.viability)}%</div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <Panel
              title="Environmental Input Lattice"
              subtitle="Fake live data generator for temperature, sound, humidity, crowding, and chamber pressure"
              icon={<Orbit className="h-5 w-5" />}
              right={<div className="text-xs uppercase tracking-[0.22em] text-white/50">stream step 900ms</div>}
            >
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <MetricTile title="Temperature" value={env.temperature} suffix="°C" icon={<Thermometer className="h-4 w-4" />} />
                  <MetricTile title="Humidity" value={env.humidity} suffix="%" icon={<Droplets className="h-4 w-4" />} tone="emerald" />
                  <MetricTile title="Sound" value={env.sound} suffix="dB" icon={<AudioLines className="h-4 w-4" />} tone="amber" />
                  <MetricTile title="Crowd" value={env.crowd} suffix="%" icon={<Users className="h-4 w-4" />} tone="rose" />
                  <MetricTile title="Pressure" value={env.pressure} suffix="kPa" icon={<Gauge className="h-4 w-4" />} tone="violet" />
                  <MetricTile title="Stability" value={derived.stability} suffix="%" icon={<Shield className="h-4 w-4" />} tone="cyan" />
                </div>

                <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
                  <SliderRow label="Temperature" value={env.temperature} min={16} max={34} step={0.1} onChange={(v) => setEnv((e) => ({ ...e, temperature: v }))} />
                  <SliderRow label="Humidity" value={env.humidity} onChange={(v) => setEnv((e) => ({ ...e, humidity: v }))} accent="emerald" />
                  <SliderRow label="Sound" value={env.sound} onChange={(v) => setEnv((e) => ({ ...e, sound: v }))} accent="amber" />
                  <SliderRow label="Crowd" value={env.crowd} onChange={(v) => setEnv((e) => ({ ...e, crowd: v }))} accent="rose" />
                  <SliderRow label="Pressure" value={env.pressure} onChange={(v) => setEnv((e) => ({ ...e, pressure: v }))} accent="violet" />
                </div>
              </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Synthetic Vitals" subtitle="Embodied theater: the mother system looks alive before hardware is wired" icon={<HeartPulse className="h-5 w-5" />}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricTile title="Breathing" value={vitals.breathingRate} suffix="rpm" icon={<Waves className="h-4 w-4" />} tone="cyan" />
                  <MetricTile title="Pulse" value={vitals.pulseRate} suffix="bpm" icon={<HeartPulse className="h-4 w-4" />} tone="rose" />
                  <MetricTile title="Metabolic load" value={vitals.metabolicLoad} suffix="%" icon={<Zap className="h-4 w-4" />} tone="amber" />
                  <MetricTile title="Womb pressure" value={vitals.wombPressure} suffix="%" icon={<Gauge className="h-4 w-4" />} tone="violet" />
                </div>
              </Panel>

              <Panel title="World Model State" subtitle="Derived latent state that the AI reasons over" icon={<Brain className="h-5 w-5" />}>
                <div className="space-y-4">
                  <ProgressBar label="Environmental stability" value={derived.stability} />
                  <ProgressBar label="Volatility" value={derived.volatility} />
                  <ProgressBar label="Attention risk" value={derived.attentionRisk} />
                  <ProgressBar label="Stealth need" value={derived.stealthNeed} />
                  <ProgressBar label="Embryo viability" value={derived.viability} />
                  <ProgressBar label="Adaptation pressure" value={derived.adaptation} />
                </div>
              </Panel>
            </div>

            <Panel title="Live Monitoring" subtitle="This is the hacky real-time theater board" icon={<Activity className="h-5 w-5" />}>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-80 rounded-3xl border border-white/10 bg-black/20 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeline}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <XAxis dataKey="t" hide />
                      <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.28)" />
                      <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16 }} />
                      <Legend />
                      <Line type="monotone" dataKey="stability" stroke="#67e8f9" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="viability" stroke="#c084fc" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="adaptation" stroke="#34d399" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-80 rounded-3xl border border-white/10 bg-black/20 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <XAxis dataKey="t" hide />
                      <YAxis stroke="rgba(255,255,255,0.28)" />
                      <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16 }} />
                      <Area type="monotone" dataKey="temperature" stroke="#22d3ee" fill="#22d3ee33" strokeWidth={2} />
                      <Area type="monotone" dataKey="humidity" stroke="#34d399" fill="#34d39922" strokeWidth={2} />
                      <Area type="monotone" dataKey="sound" stroke="#f59e0b" fill="#f59e0b22" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Panel>

            <Panel title="Embryo Genome Compiler" subtitle="Quantitative and qualitative gene mixing board" icon={<Dna className="h-5 w-5" />}>
              <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
                  <SliderRow label="Body size" value={genome.bodySize} onChange={(v) => setGenome((g) => ({ ...g, bodySize: v }))} />
                  <SliderRow label="Bone density" value={genome.boneDensity} onChange={(v) => setGenome((g) => ({ ...g, boneDensity: v }))} accent="violet" />
                  <SliderRow label="Shell flex" value={genome.shellFlex} onChange={(v) => setGenome((g) => ({ ...g, shellFlex: v }))} accent="emerald" />
                  <SliderRow label="Sensor density" value={genome.sensorDensity} onChange={(v) => setGenome((g) => ({ ...g, sensorDensity: v }))} accent="cyan" />
                  <SliderRow label="Energy reserve" value={genome.energyReserve} onChange={(v) => setGenome((g) => ({ ...g, energyReserve: v }))} accent="amber" />
                  <SliderRow label="Curiosity" value={genome.curiosity} onChange={(v) => setGenome((g) => ({ ...g, curiosity: v }))} accent="cyan" />
                  <SliderRow label="Caution" value={genome.caution} onChange={(v) => setGenome((g) => ({ ...g, caution: v }))} accent="rose" />
                  <SliderRow label="Sociability" value={genome.sociability} onChange={(v) => setGenome((g) => ({ ...g, sociability: v }))} accent="violet" />
                  <SliderRow label="Limb length" value={genome.limbLength} onChange={(v) => setGenome((g) => ({ ...g, limbLength: v }))} accent="emerald" />
                  <SliderRow label="Signal intensity" value={genome.signalIntensity} onChange={(v) => setGenome((g) => ({ ...g, signalIntensity: v }))} accent="amber" />
                </div>
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectRow label="Bone structure" value={genome.boneStructure} options={QUAL.boneStructure} onChange={(v) => setGenome((g) => ({ ...g, boneStructure: v }))} />
                    <SelectRow label="Surface type" value={genome.surfaceType} options={QUAL.surfaceType} onChange={(v) => setGenome((g) => ({ ...g, surfaceType: v }))} />
                    <SelectRow label="Locomotion" value={genome.locomotion} options={QUAL.locomotion} onChange={(v) => setGenome((g) => ({ ...g, locomotion: v }))} />
                    <SelectRow label="Temperament" value={genome.temperament} options={QUAL.temperament} onChange={(v) => setGenome((g) => ({ ...g, temperament: v }))} />
                  </div>

                  <div className="h-72 rounded-3xl border border-white/10 bg-black/20 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={phenotypeRadar}>
                        <PolarGrid stroke="rgba(255,255,255,0.12)" />
                        <PolarAngleAxis dataKey="trait" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
                        <Radar dataKey="value" stroke="#67e8f9" fill="#67e8f933" fillOpacity={0.8} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <MetricTile title="Species class" value={derived.viability} suffix="% fit" icon={<Baby className="h-4 w-4" />} tone="violet" />
                    <MetricTile title="Locomotion bias" value={derived.agility} suffix="%" icon={<Rabbit className="h-4 w-4" />} tone="emerald" />
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <div className="space-y-6 xl:col-span-4">
            <Panel title="AI Reflection" subtitle="This path is supposed to be real. Hook it to your backend OpenAI route." icon={<Bot className="h-5 w-5" />} right={<div className="text-xs uppercase tracking-[0.22em] text-white/50">route /api/life3-reason</div>}>
              <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm leading-7 text-cyan-50">
                {aiBusy ? "Thinking…" : ai?.summary ?? "No AI reasoning yet."}
              </div>
              {aiError ? <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">Backend unavailable: {aiError}. Showing local fallback.</div> : null}
              {ai ? <div className="mt-4 text-sm text-white/70">Chosen embryo: <span className="font-semibold text-white">{ai.chosenName}</span> — {ai.chosenReason}</div> : null}
            </Panel>

            <Panel title="Hidden Beliefs" subtitle="Latent variables inferred by the model" icon={<Cpu className="h-5 w-5" />}>
              <div className="h-72 rounded-3xl border border-white/10 bg-black/20 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hiddenBeliefsChart} layout="vertical" margin={{ left: 20, right: 10 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} stroke="rgba(255,255,255,0.28)" />
                    <YAxis type="category" dataKey="name" width={120} stroke="rgba(255,255,255,0.45)" />
                    <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16 }} />
                    <Bar dataKey="value" fill="#c084fc" radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Embryo Candidates" subtitle="What the AI thinks the mother could build next" icon={<Sparkles className="h-5 w-5" />}>
              <div className="space-y-4">
                {(ai?.candidates ?? fakeAI(env, genome).candidates).map((candidate, index) => (
                  <motion.div key={candidate.id} whileHover={{ y: -2 }} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/85">{candidate.name}</div>
                        <div className="mt-1 text-xs text-white/45">{candidate.classLabel}</div>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-xs font-semibold ${index === 0 ? "bg-cyan-500/15 text-cyan-200" : "bg-white/10 text-white/70"}`}>
                        {Math.round(candidate.score)}
                      </div>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-white/70">{candidate.rationale}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidate.mutations.map((mutation) => (
                        <span key={mutation} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65">
                          {mutation}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </Panel>

            <Panel title="Compiler Recommendation" subtitle="Environment-aware body and behavior package" icon={<Bone className="h-5 w-5" />}>
              <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                <div className="flex items-center justify-between"><span>Body geometry</span><span className="font-semibold text-white">{derived.recommendations.size}</span></div>
                <div className="flex items-center justify-between"><span>Bone system</span><span className="font-semibold text-white">{derived.recommendations.bone}</span></div>
                <div className="flex items-center justify-between"><span>Locomotion</span><span className="font-semibold text-white">{derived.recommendations.motion}</span></div>
                <div className="flex items-center justify-between"><span>Signaling</span><span className="font-semibold text-white">{derived.recommendations.signal}</span></div>
              </div>
            </Panel>

            <Panel title="Event / Model Log" subtitle="Make the system feel procedural and alive" icon={<ScrollText className="h-5 w-5" />}>
              <div className="max-h-[34rem] space-y-3 overflow-auto pr-1">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-6">
                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-white/45">
                      <span>{log.level}</span>
                      <span>{log.time}</span>
                    </div>
                    <div className="text-white/75">{log.text}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
