"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { aggregateScore } from "./lib/dashboard/decision";
import {
  cameraRgbPercent,
  type DerivedHistoryPoint,
  type DerivedSnapshot,
  computeDerivedSnapshot,
  formulaText,
  initialSensors,
  pushDerivedHistory,
  pushRawHistory,
  sensorPercent,
  simulateSensorStep,
  timeLabel,
} from "./lib/dashboard/pipeline";
import { SENSOR_INPUT_SCHEMA } from "./lib/dashboard/schema";
import { THEMES } from "./lib/dashboard/themes";
import type {
  BabyDiscreteConfig,
  BabyGenomeResponse,
  BabySnapshot,
  DerivedObjective,
  SensorInput,
  ThemeName,
  WorldModelResponse,
  WorldModelSpec,
} from "./lib/dashboard/types";

type TheaterMode = "raw" | "derived";

type FrameState = {
  tick: number;
  sensors: SensorInput;
  rawHistory: Array<{ label: string; sensors: SensorInput }>;
  derivedHistory: DerivedHistoryPoint[];
};

const STREAM_WINDOW = 120;
const HEAT_TRIGGER_SECONDS = 5;
const BABY_MEMORY_STORAGE_KEY = "life3_baby_memory_v1";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function isClassifiedTheme(themeName: ThemeName) {
  return themeName === "Cipher" || themeName === "Obsidian";
}

function isObsidianTheme(themeName: ThemeName) {
  return themeName === "Obsidian";
}

function panelGlow(themeName: ThemeName) {
  const map: Record<ThemeName, string> = {
    Obsidian: "0 24px 72px rgba(255, 242, 0, 0.14)",
    Cipher: "0 30px 90px rgba(15, 23, 42, 0.45)",
    Zenith: "0 28px 80px rgba(12, 65, 95, 0.34)",
    Quartz: "0 28px 80px rgba(76, 35, 92, 0.34)",
    Tidal: "0 28px 80px rgba(21, 80, 76, 0.34)",
    Lumen: "0 28px 80px rgba(92, 67, 20, 0.34)",
  };

  return map[themeName];
}

function classifiedScan(themeName: ThemeName) {
  if (!isClassifiedTheme(themeName)) return "transparent";

  if (isObsidianTheme(themeName)) {
    return "repeating-linear-gradient(0deg, rgba(255,247,0,0.03) 0px, rgba(255,247,0,0.03) 1px, transparent 1px, transparent 4px)";
  }

  return "repeating-linear-gradient(0deg, rgba(148,163,184,0.06) 0px, rgba(148,163,184,0.06) 1px, transparent 1px, transparent 4px)";
}

function classifiedGrid(themeName: ThemeName) {
  if (!isClassifiedTheme(themeName)) return "transparent";

  if (isObsidianTheme(themeName)) {
    return "linear-gradient(rgba(255,247,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,247,0,0.04) 1px, transparent 1px)";
  }

  return "linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)";
}

function formatValue(value: number, digits = 1) {
  return value.toFixed(digits);
}

function buildDerivedPoint(label: string, snapshot: DerivedSnapshot[]): DerivedHistoryPoint {
  return {
    label,
    values: Object.fromEntries(snapshot.map((item) => [item.id, item.value])),
    aggregate: Number(aggregateScore(snapshot).toFixed(1)),
  };
}

function Panel({
  title,
  subtitle,
  right,
  themeName,
  fillHeight,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  themeName: ThemeName;
  fillHeight?: boolean;
  children: React.ReactNode;
}) {
  const theme = THEMES[themeName];
  const frameClass = isClassifiedTheme(themeName) ? "min-h-0 rounded-md border p-4 md:p-5" : "min-h-0 rounded-md border p-4 md:p-5";

  return (
    <section
      className={frameClass}
      style={{
        background: theme.panel,
        borderColor: theme.border,
        boxShadow: panelGlow(themeName),
        ...(fillHeight
          ? ({
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            } as const)
          : null),
        outline: isClassifiedTheme(themeName)
          ? isObsidianTheme(themeName)
            ? "1px solid rgba(255, 224, 0, 0.2)"
            : "1px solid rgba(148,163,184,0.14)"
          : "none",
        outlineOffset: isClassifiedTheme(themeName) ? "-6px" : "0px",
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.23em]">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: theme.muted }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {right}
      </div>
      <div className="min-h-0" style={fillHeight ? { flex: 1, minHeight: 0 } : undefined}>
        {children}
      </div>
    </section>
  );
}

function IconBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm border px-1 text-[9px] font-semibold uppercase tracking-[0.08em] opacity-85">
      {tag}
    </span>
  );
}

function SensorCard({
  label,
  icon,
  value,
  unit,
  range,
  themeName,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  unit: string;
  range: string;
  themeName: ThemeName;
}) {
  const theme = THEMES[themeName];
  const shellClass = isClassifiedTheme(themeName) ? "rounded-md border p-3" : "rounded-md border p-3";

  return (
    <div className={shellClass} style={{ borderColor: theme.border, background: theme.subpanel }}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]" style={{ color: theme.muted }}>
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">
        {value}
        {value !== "--" && unit ? (
          <span className="ml-1 text-sm font-medium" style={{ color: theme.muted }}>
            {unit}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: theme.muted }}>
        {range}
      </div>
    </div>
  );
}

function DerivedCard({
  label,
  description,
  objective,
  value,
  threshold,
  themeName,
}: {
  label: string;
  description: string;
  objective: DerivedObjective;
  value: number;
  threshold: number;
  themeName: ThemeName;
}) {
  const theme = THEMES[themeName];
  const isThresholdBreached =
    objective === "maximize"
      ? value < threshold
      : objective === "minimize"
        ? value > threshold
        : objective === "monitor"
          ? value <= 0 || value >= threshold
          : false;
  const thresholdText =
    objective === "maximize"
      ? `min ${threshold.toFixed(1)}`
      : objective === "minimize"
        ? `max ${threshold.toFixed(1)}`
        : objective === "monitor"
          ? `0 < x < ${threshold.toFixed(1)}f`
          : "threshold off";
  const objectiveColor =
    objective === "maximize" ? "#6ee7b7" : objective === "minimize" ? "#fda4af" : objective === "monitor" ? "#facc15" : "#a3a3a3";
  const objectiveBg =
    objective === "maximize"
      ? "rgba(16,185,129,0.16)"
      : objective === "minimize"
        ? "rgba(244,63,94,0.14)"
        : objective === "monitor"
          ? "rgba(250,204,21,0.14)"
          : "rgba(163,163,163,0.15)";
  const shellClass = isClassifiedTheme(themeName) ? "rounded-md border p-3" : "rounded-md border p-3";

  return (
    <div className={shellClass} style={{ borderColor: theme.border, background: theme.subpanel }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-1 text-xs leading-relaxed" style={{ color: theme.muted }}>
            {description}
          </div>
        </div>
        <div
          className="rounded-sm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{
            color: objectiveColor,
            background: objectiveBg,
          }}
        >
          {objective}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold" style={{ color: isThresholdBreached ? "#fb7185" : theme.text }}>
          {value.toFixed(1)}
        </div>
        <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
          {thresholdText}
        </div>
      </div>
    </div>
  );
}

type ChartSeries = {
  key: string;
  label: string;
  color: string;
  strokeWidth?: number;
  dasharray?: string;
};

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function SimpleLineChart({
  data,
  series,
  themeName,
}: {
  data: Array<Record<string, string | number>>;
  series: ChartSeries[];
  themeName: ThemeName;
}) {
  const theme = THEMES[themeName];
  const width = 1000;
  const height = 320;
  const padX = 30;
  const padY = 18;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  if (data.length < 2) {
    return (
      <div className="grid h-full place-items-center rounded-md border text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
        Waiting for stream points...
      </div>
    );
  }

  const yMax = Math.max(
    100,
    ...data.flatMap((row) => series.map((item) => Math.max(0, safeNumber(row[item.key]))))
  );

  const y = (value: number) => {
    const normalized = clamp(value, 0, yMax) / yMax;
    return padY + (1 - normalized) * innerH;
  };

  const x = (index: number) => {
    const den = Math.max(data.length - 1, 1);
    return padX + (index / den) * innerW;
  };

  const pointsFor = (key: string) =>
    data
      .map((row, index) => `${x(index)},${y(safeNumber(row[key]))}`)
      .join(" ");

  const leftLabel = String(data[0]?.t ?? "");
  const rightLabel = String(data[data.length - 1]?.t ?? "");

  return (
    <svg className="h-full w-full rounded-md border" style={{ borderColor: theme.border, background: theme.subpanel }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const level = yMax * ratio;
        return <line key={level} x1={padX} x2={width - padX} y1={y(level)} y2={y(level)} stroke={theme.border} strokeDasharray="4 4" strokeWidth="1" />;
      })}
      {series.map((item) => (
        <g key={item.key}>
          <polyline
            points={pointsFor(item.key)}
            fill="none"
            stroke={item.color}
            strokeWidth={(item.strokeWidth ?? 2) + 1.4}
            strokeOpacity={0.17}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={item.dasharray}
          />
          <polyline
            points={pointsFor(item.key)}
            fill="none"
            stroke={item.color}
            strokeWidth={item.strokeWidth ?? 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={item.dasharray}
          />
        </g>
      ))}
      <text x={padX} y={height - 6} fill={theme.muted} fontSize="11">
        {leftLabel}
      </text>
      <text x={width - padX} y={height - 6} fill={theme.muted} fontSize="11" textAnchor="end">
        {rightLabel}
      </text>
    </svg>
  );
}

function SeriesLegend({
  series,
  themeName,
}: {
  series: ChartSeries[];
  themeName: ThemeName;
}) {
  const theme = THEMES[themeName];

  if (series.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {series.map((item) => (
        <div key={item.key} className="inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-[11px]" style={{ borderColor: theme.border, color: theme.muted, background: theme.subpanel }}>
          <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
            <line
              x1="1"
              y1="4"
              x2="21"
              y2="4"
              stroke={item.color}
              strokeWidth={2.1}
              strokeDasharray={item.dasharray}
              strokeLinecap="round"
            />
          </svg>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function BabyGenomeModal({
  open,
  loading,
  error,
  result,
  memory,
  themeName,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  result: BabyGenomeResponse | null;
  memory: Array<{ capturedAt: string; config: BabyDiscreteConfig }>;
  themeName: ThemeName;
  onClose: () => void;
}) {
  const theme = THEMES[themeName];
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-md border p-4 md:p-5"
        style={{ background: theme.panel, borderColor: theme.border, boxShadow: panelGlow(themeName) }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
              Birth Trigger
            </div>
            <h3 className="mt-1 text-lg font-semibold uppercase tracking-[0.08em]">Baby Genome Projection</h3>
            <div className="mt-1 text-xs" style={{ color: theme.muted }}>
              Realizability interface file: `lib/dashboard/baby-realization.ts`
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em]"
            style={{ borderColor: theme.border }}
          >
            close
          </button>
        </div>

        {loading ? (
          <div className="rounded-md border p-3 text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
            Captured snapshot. Generating baby traits and realizable projection...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border p-3 text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: "#fb7185" }}>
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
                Snapshot
              </div>
              <div className="mt-2 text-sm" style={{ color: theme.muted }}>
                tick {result.snapshot.tick} | hot {result.snapshot.hotSeconds}s | threshold {result.snapshot.monitorThresholdF.toFixed(1)}F
              </div>
              <div className="mt-2 max-h-32 space-y-1 overflow-auto pr-1 text-sm">
                {result.snapshot.derived.length === 0 ? (
                  <div style={{ color: theme.muted }}>no world-model snapshot states</div>
                ) : (
                  result.snapshot.derived.map((item) => {
                    const breached =
                      item.objective === "maximize"
                        ? item.value < item.threshold
                        : item.objective === "minimize"
                          ? item.value > item.threshold
                          : item.objective === "monitor"
                            ? item.value <= 0 || item.value >= item.threshold
                            : false;
                    const objectiveLabel =
                      item.objective === "maximize"
                        ? `min ${item.threshold.toFixed(1)}`
                        : item.objective === "minimize"
                          ? `max ${item.threshold.toFixed(1)}`
                          : item.objective === "monitor"
                            ? `0 < x < ${item.threshold.toFixed(1)}f`
                            : "off";
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-sm border px-2 py-1" style={{ borderColor: theme.border }}>
                        <div className="truncate">
                          <span className="font-medium">{item.label}</span>
                          <span className="ml-2 text-[11px]" style={{ color: theme.muted }}>
                            {objectiveLabel}
                          </span>
                        </div>
                        <div className="font-semibold" style={{ color: breached ? "#fb7185" : theme.text }}>
                          {item.value.toFixed(1)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-2 text-[11px]" style={{ color: theme.muted }}>
                source: {result.source} {result.debug?.responseId ? `| id: ${result.debug.responseId}` : ""}
              </div>
            </div>

            <div className="rounded-md border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
                Traits
              </div>
              <div className="mt-2 text-sm">{`speed ${result.realizedTraits.speed.toFixed(2)} m/s`}</div>
              <div className="text-sm">{`breathing ${result.realizedTraits.breathingRate.toFixed(1)} rpm`}</div>
              <div className="text-sm">{`body size ${result.realizedTraits.bodySize.toFixed(1)} cm`}</div>
              <div className="text-sm">{`mode ${result.realizedTraits.mode}`}</div>
            </div>

            <div className="rounded-md border p-3 md:col-span-2" style={{ borderColor: theme.border, background: theme.subpanel }}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
                Realizable Projection
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <div className="rounded-md border p-2" style={{ borderColor: theme.border }}>
                  <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
                    Pump Power
                  </div>
                  <div className="mt-1 text-lg font-semibold">{result.realizedProjection.pumpPower}%</div>
                  <div className="mt-1 text-[11px]" style={{ color: theme.muted }}>
                    {result.realizedProjection.explanation.pumpPower}
                  </div>
                </div>
                <div className="rounded-md border p-2" style={{ borderColor: theme.border }}>
                  <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
                    Micro Servo
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    ({result.realizedProjection.microServoAngle}, {result.realizedProjection.microServoAngle})
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: theme.muted }}>
                    {result.realizedProjection.explanation.microServoAngle}
                  </div>
                </div>
                <div className="rounded-md border p-2" style={{ borderColor: theme.border }}>
                  <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
                    Light
                  </div>
                  <div className="mt-1 text-lg font-semibold">{result.realizedProjection.lightColor}</div>
                  <div className="mt-1 text-[11px]" style={{ color: theme.muted }}>
                    {result.realizedProjection.explanation.lightColor}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3 md:col-span-2" style={{ borderColor: theme.border, background: theme.subpanel }}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
                In-Session Baby Memory ({memory.length})
              </div>
              <div className="mt-2 max-h-28 space-y-1 overflow-auto pr-1 text-[11px]" style={{ color: theme.muted }}>
                {memory.length === 0 ? (
                  <div>none</div>
                ) : (
                  memory.map((item, index) => (
                    <div key={`${item.capturedAt}_${index}`}>
                      #{index + 1} [{item.config.pumpPower} | {item.config.microServoAngle} | {item.config.lightColor}] @{item.capturedAt}
                    </div>
                  ))
                )}
              </div>
              <div className="mt-2 text-[11px]" style={{ color: theme.muted }}>
                Next baby generation sends this history to the prompt and forbids repeated discrete configs.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Life3Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const themeName: ThemeName = "Obsidian";
  const [prompt, setPrompt] = useState("");
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  const [modelTrace, setModelTrace] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState<"idle" | "openai" | "local">("idle");
  const [theaterMode, setTheaterMode] = useState<TheaterMode>("raw");
  const [worldModel, setWorldModel] = useState<WorldModelSpec | null>(null);
  const [debugHeatMode, setDebugHeatMode] = useState(false);
  const [babyModalOpen, setBabyModalOpen] = useState(false);
  const [babyBusy, setBabyBusy] = useState(false);
  const [babyError, setBabyError] = useState<string | null>(null);
  const [babyResult, setBabyResult] = useState<BabyGenomeResponse | null>(null);
  const [babyMemory, setBabyMemory] = useState<Array<{ capturedAt: string; config: BabyDiscreteConfig }>>([]);
  const [hotSeconds, setHotSeconds] = useState(0);
  const [triggerArmed, setTriggerArmed] = useState(true);
  const derivedPanelRef = useRef<HTMLDivElement | null>(null);

  const [frame, setFrame] = useState<FrameState>(() => {
    const sensors = initialSensors();
    return {
      tick: 0,
      sensors,
      rawHistory: [{ label: timeLabel(0), sensors }],
      derivedHistory: [],
    };
  });

  const currentDerived = useMemo(
    () => (worldModel ? computeDerivedSnapshot(worldModel.definitions, frame.sensors) : []),
    [frame.sensors, worldModel]
  );

  const surroundingTemperatureState = useMemo(
    () => currentDerived.find((item) => item.id === "fixed_surrounding_temperature"),
    [currentDerived]
  );

  const generateBabyGenome = useCallback(async (snapshot: BabySnapshot) => {
    setBabyModalOpen(true);
    setBabyBusy(true);
    setBabyError(null);
    setBabyResult(null);

    try {
      const response = await fetch("/api/baby-genome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot,
          forbiddenConfigs: babyMemory.map((item) => item.config),
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? `Baby genome request failed (${response.status})`);
      }

      const data = (await response.json()) as BabyGenomeResponse;
      setBabyResult(data);
      setBabyMemory((prev) => [
        ...prev,
        {
          capturedAt: data.snapshot.capturedAt,
          config: {
            pumpPower: data.realizedProjection.pumpPower,
            microServoAngle: data.realizedProjection.microServoAngle,
            lightColor: data.realizedProjection.lightColor,
          },
        },
      ]);
    } catch (error) {
      setBabyError(error instanceof Error ? error.message : "Unknown baby genome generation error");
    } finally {
      setBabyBusy(false);
    }
  }, [babyMemory]);

  useEffect(() => {
    setHydrated(true);
    try {
      const raw = window.sessionStorage.getItem(BABY_MEMORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const loaded = parsed
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const config = row.config as Record<string, unknown> | undefined;
          if (!config) return null;
          const pumpRaw = Number(config.pumpPower);
          const angleRaw = Number(config.microServoAngle);
          const lightRaw = String(config.lightColor ?? "");
          const pumpPower: BabyDiscreteConfig["pumpPower"] =
            pumpRaw === 50 || pumpRaw === 75 || pumpRaw === 100 ? pumpRaw : 50;
          const microServoAngle: BabyDiscreteConfig["microServoAngle"] = angleRaw === 90 ? 90 : 0;
          const lightColor: BabyDiscreteConfig["lightColor"] = lightRaw === "Red" ? "Red" : "Green";
          return {
            capturedAt: typeof row.capturedAt === "string" ? row.capturedAt : new Date().toISOString(),
            config: { pumpPower, microServoAngle, lightColor },
          };
        })
        .filter((item): item is { capturedAt: string; config: BabyDiscreteConfig } => item !== null)
        .slice(-40);
      setBabyMemory(loaded);
    } catch {
      // Ignore corrupted or unavailable sessionStorage.
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(BABY_MEMORY_STORAGE_KEY, JSON.stringify(babyMemory.slice(-40)));
    } catch {
      // Ignore storage write failures.
    }
  }, [babyMemory, hydrated]);

  useEffect(() => {
    if (!worldModel) return;
    derivedPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [worldModel?.generatedAt]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((prev) => {
        const nextTick = prev.tick + 1;
        let nextSensors = simulateSensorStep(prev.sensors);
        if (debugHeatMode) {
          const hotTemp = Math.max(130.4, 136 + Math.sin(nextTick / 3) * 6 + (Math.random() - 0.5) * 2);
          nextSensors = {
            ...nextSensors,
            temperatureF: Number(hotTemp.toFixed(1)),
          };
        }
        const label = timeLabel(nextTick);
        const rawHistory = pushRawHistory(prev.rawHistory, { label, sensors: nextSensors });

        let derivedHistory = prev.derivedHistory;
        if (worldModel) {
          const snapshot = computeDerivedSnapshot(worldModel.definitions, nextSensors);
          derivedHistory = pushDerivedHistory(prev.derivedHistory, buildDerivedPoint(label, snapshot));
        }

        return {
          tick: nextTick,
          sensors: nextSensors,
          rawHistory,
          derivedHistory,
        };
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [debugHeatMode, worldModel]);

  useEffect(() => {
    if (frame.tick === 0) return;
    // Trigger is strictly gated by derived surrounding temperature state.
    // If the surrounding temperature derived state does not exist yet, never trigger.
    if (!surroundingTemperatureState) {
      setHotSeconds(0);
      setTriggerArmed(true);
      return;
    }
    const monitorBreached =
      surroundingTemperatureState.value <= 0 ||
      surroundingTemperatureState.value >= surroundingTemperatureState.threshold;
    if (monitorBreached) {
      setHotSeconds((prev) => prev + 1);
      return;
    }
    setHotSeconds(0);
    setTriggerArmed(true);
  }, [frame.tick, surroundingTemperatureState]);

  useEffect(() => {
    if (!surroundingTemperatureState) return;
    if (!triggerArmed || hotSeconds < HEAT_TRIGGER_SECONDS || babyBusy) return;

    const snapshot: BabySnapshot = {
      capturedAt: new Date().toISOString(),
      tick: frame.tick,
      hotSeconds: HEAT_TRIGGER_SECONDS,
      monitorThresholdF: Number(surroundingTemperatureState.threshold.toFixed(1)),
      sensors: { ...frame.sensors },
      derived: currentDerived.map((item) => ({
        id: item.id,
        label: item.label,
        value: Number(item.value.toFixed(1)),
        objective: item.objective,
        threshold: Number(item.threshold.toFixed(1)),
      })),
    };

    setTriggerArmed(false);
    void generateBabyGenome(snapshot);
  }, [babyBusy, currentDerived, frame.sensors, frame.tick, generateBabyGenome, hotSeconds, surroundingTemperatureState, triggerArmed]);

  const generateWorldModel = useCallback(async () => {
    const trimmed = prompt.trim();

    if (!trimmed) {
      setModelError("Enter a prompt before generating derived states.");
      setModelWarning(null);
      return;
    }

    setModelBusy(true);
    setModelError(null);
    setModelWarning(null);
    setModelTrace("Derived world model generating...");
    setTheaterMode("derived");

    try {
      const response = await fetch("/api/world-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? `World model request failed (${response.status})`);
      }

      const data = (await response.json()) as WorldModelResponse;
      setModelSource(data.source);
      setModelWarning(data.warning ?? null);
      if (data.debug) {
        const bits = [
          data.debug.provider,
          data.debug.modelId,
          data.debug.responseId ? `id:${data.debug.responseId}` : "",
          data.debug.latencyMs != null ? `${data.debug.latencyMs}ms` : "",
        ].filter(Boolean);
        setModelTrace(bits.join(" | "));
      } else {
        setModelTrace(null);
      }
      setWorldModel(data.model);

      setFrame((prev) => {
        const derivedHistory = prev.rawHistory.map((point) => {
          const snapshot = computeDerivedSnapshot(data.model.definitions, point.sensors);
          return buildDerivedPoint(point.label, snapshot);
        });

        return {
          ...prev,
          derivedHistory,
        };
      });
    } catch (error) {
      setModelError(error instanceof Error ? error.message : "Unknown world-model generation error");
      setModelTrace(null);
    } finally {
      setModelBusy(false);
    }
  }, [prompt]);

  const clearWorldModel = useCallback(() => {
    setWorldModel(null);
    setModelSource("idle");
    setModelWarning(null);
    setModelTrace(null);
    setModelError(null);
    setTheaterMode("raw");
    setFrame((prev) => ({ ...prev, derivedHistory: [] }));
  }, []);

  const rawChartData = useMemo(
    () =>
      frame.rawHistory.slice(-STREAM_WINDOW).map((point) => ({
        t: point.label,
        temperatureF: Number(sensorPercent("temperatureF", point.sensors.temperatureF).toFixed(1)),
        cameraRgb: cameraRgbPercent(point.sensors),
        acousticDb: Number(sensorPercent("acousticDb", point.sensors.acousticDb).toFixed(1)),
      })),
    [frame.rawHistory]
  );

  const derivedDefinitions = useMemo(() => worldModel?.definitions ?? [], [worldModel]);

  const derivedChartData = useMemo(
    () =>
      frame.derivedHistory.slice(-STREAM_WINDOW).map((point) => {
        const row: Record<string, string | number> = {
          t: point.label,
        };

        for (const item of derivedDefinitions) {
          row[item.id] = Number((point.values[item.id] ?? 0).toFixed(1));
        }

        return row;
      }),
    [derivedDefinitions, frame.derivedHistory]
  );

  const rawSeries = useMemo<ChartSeries[]>(
    () => [
      { key: "temperatureF", label: "Temp F", color: "#00e5ff", strokeWidth: 2.3, dasharray: "0" },
      { key: "cameraRgb", label: "Camera RGB", color: "#ff4dff", strokeWidth: 2.1, dasharray: "10 6" },
      { key: "acousticDb", label: "Acoustic", color: "#7dff7a", strokeWidth: 2.1, dasharray: "4 5" },
    ],
    []
  );

  const derivedSeries = useMemo<ChartSeries[]>(
    () => {
      const palette = ["#ffe500", "#00e5ff", "#ff4dff", "#7dff7a", "#f7f7f7", "#ff9e3d"] as const;
      const dashPatterns = ["0", "8 5", "3 5", "13 6", "2 4", "11 4"] as const;

      return derivedDefinitions.map((item, index) => ({
        key: item.id,
        label: item.label,
        color: palette[index % palette.length],
        strokeWidth: index === 0 ? 2.5 : 2,
        dasharray: dashPatterns[index % dashPatterns.length],
      }));
    },
    [derivedDefinitions]
  );

  const theme = THEMES[themeName];
  const obsidian = isObsidianTheme(themeName);
  const chipFill = obsidian ? "rgba(255,238,0,0.16)" : "transparent";
  const boardIdle = !worldModel;
  const derivedStatusText = modelBusy ? "derived generating" : boardIdle ? "derived idle" : `${worldModel.definitions.length} derived states`;

  return (
    <div className="h-[100dvh] overflow-x-hidden overflow-y-auto p-3 md:p-4 xl:overflow-y-hidden" style={{ background: theme.canvas, color: theme.text }}>
      <div className="pointer-events-none fixed inset-0" style={{ backgroundImage: theme.mesh, opacity: 0.78 }} />
      <div
        className="pointer-events-none fixed inset-0"
        style={{ backgroundImage: classifiedGrid(themeName), backgroundSize: "34px 34px", opacity: obsidian ? 0.2 : 0.45 }}
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{ backgroundImage: classifiedScan(themeName), opacity: obsidian ? 0.16 : 0.36, mixBlendMode: "screen" }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1700px] grid-cols-1 gap-4 xl:h-full xl:grid-cols-12">
        <div className="grid min-h-0 gap-4 xl:col-span-8 xl:grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid min-h-0 gap-4 lg:grid-cols-2 lg:items-start">
            <Panel
              title="Sensor Input"
              subtitle="Measured raw stream (read-only)"
              themeName={themeName}
              right={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Toggle temperature debug mode"
                    aria-pressed={debugHeatMode}
                    title={debugHeatMode ? "debug: thermal override on" : "debug: thermal override off"}
                    onClick={() => setDebugHeatMode((prev) => !prev)}
                    className="inline-flex h-3 min-w-[14px] items-center justify-center rounded-sm border px-[1px] text-[6px] font-semibold leading-none uppercase tracking-[0.08em] transition-opacity hover:opacity-100"
                    style={{
                      borderColor: debugHeatMode ? "#fb7185" : theme.border,
                      color: debugHeatMode ? "#fb7185" : theme.muted,
                      background: debugHeatMode ? "rgba(251,113,133,0.2)" : theme.subpanel,
                      boxShadow: debugHeatMode ? "0 0 8px rgba(251,113,133,0.2)" : "none",
                      transform: "scale(0.56)",
                      transformOrigin: "center",
                    }}
                  >
                    dbg
                  </button>
                  <IconBadge tag="in" />
                </div>
              }
            >
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                <SensorCard
                  label={SENSOR_INPUT_SCHEMA.temperatureF.label}
                  icon={<IconBadge tag="tmp" />}
                  value={formatValue(frame.sensors.temperatureF)}
                  unit={SENSOR_INPUT_SCHEMA.temperatureF.unit}
                  range={`${SENSOR_INPUT_SCHEMA.temperatureF.min}-${SENSOR_INPUT_SCHEMA.temperatureF.max}`}
                  themeName={themeName}
                />
                <SensorCard
                  label="Camera RGB"
                  icon={<IconBadge tag="cam" />}
                  value={`${frame.sensors.cameraR}/${frame.sensors.cameraG}/${frame.sensors.cameraB}`}
                  unit=""
                  range="0-255 / channel"
                  themeName={themeName}
                />
                <SensorCard
                  label={SENSOR_INPUT_SCHEMA.acousticDb.label}
                  icon={<IconBadge tag="db" />}
                  value={formatValue(frame.sensors.acousticDb)}
                  unit={SENSOR_INPUT_SCHEMA.acousticDb.unit}
                  range={`${SENSOR_INPUT_SCHEMA.acousticDb.min}-${SENSOR_INPUT_SCHEMA.acousticDb.max}`}
                  themeName={themeName}
                />
              </div>
            </Panel>

            <Panel
              title="World Model Prompt"
              subtitle="AI is called only when you press Generate. No prompt means derived board stays idle."
              themeName={themeName}
              right={<IconBadge tag="pr" />}
            >
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="h-32 w-full resize-none rounded-md border px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: theme.border,
                  background: theme.subpanel,
                  color: theme.text,
                }}
                placeholder="Describe what the model should optimize and monitor..."
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void generateWorldModel()}
                  disabled={modelBusy}
                  className="rounded-md border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] disabled:cursor-not-allowed disabled:opacity-55"
                  style={{
                    borderColor: theme.border,
                    background: obsidian ? theme.accent : theme.subpanel,
                    color: obsidian ? "#090909" : theme.text,
                    boxShadow: obsidian ? "0 10px 24px rgba(255, 212, 0, 0.22)" : "none",
                  }}
                >
                  {modelBusy ? "generating..." : "generate world model"}
                </button>
                <button
                  onClick={clearWorldModel}
                  disabled={!worldModel}
                  className="rounded-md border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ borderColor: theme.border }}
                >
                  clear
                </button>
                <div className="rounded-sm border px-3 py-1 text-[11px] uppercase tracking-[0.2em]" style={{ borderColor: theme.border, background: chipFill }}>
                  model {modelSource}
                </div>
                <div className="rounded-sm border px-3 py-1 text-[11px] uppercase tracking-[0.2em]" style={{ borderColor: theme.border, background: chipFill }}>
                  {derivedStatusText}
                </div>
              </div>

              {modelWarning ? (
                <div className="mt-2 text-xs" style={{ color: "#facc15" }}>
                  {modelWarning}
                </div>
              ) : null}
              {modelTrace ? (
                <div className="mt-1 text-[11px]" style={{ color: theme.muted }}>
                  {modelTrace}
                </div>
              ) : null}
              {modelError ? (
                <div className="mt-2 text-xs" style={{ color: "#fb7185" }}>
                  {modelError}
                </div>
              ) : null}
            </Panel>
          </div>

          <div ref={derivedPanelRef} className="min-h-0">
            <Panel
              title="Derived World State"
              subtitle="Computed from AI-returned weighted formulas over live sensor values"
              themeName={themeName}
              right={<IconBadge tag="ai" />}
            >
              {modelBusy ? (
                <div className="grid h-full min-h-[36dvh] place-items-center rounded-md border" style={{ borderColor: theme.border, background: theme.subpanel }}>
                  <div className="max-w-xl text-center">
                    <div className="text-sm font-semibold uppercase tracking-[0.25em]">generating</div>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.muted }}>
                      Building derived world model from your prompt. Waiting for model output before rendering derived states.
                    </p>
                  </div>
                </div>
              ) : !worldModel ? (
                <div className="grid h-full min-h-[36dvh] place-items-center rounded-md border" style={{ borderColor: theme.border, background: theme.subpanel }}>
                  <div className="max-w-xl text-center">
                    <div className="text-sm font-semibold uppercase tracking-[0.25em]">idle</div>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.muted }}>
                      Provide a prompt and generate the world model. The board will then load 5-6 derived states (3-4 AI-generated + Surrounding Temperature + Hue) and continuously compute them from the raw sensor stream.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid h-full min-h-[36dvh] gap-3 overflow-y-auto pr-1 lg:grid-cols-2 xl:grid-cols-3">
                  {currentDerived.map((item) => (
                    <DerivedCard
                      key={item.id}
                      label={item.label}
                      description={item.description}
                      objective={item.objective}
                      value={item.value}
                      threshold={item.threshold}
                      themeName={themeName}
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div className="grid min-h-0 gap-4 xl:col-span-4 xl:h-full xl:grid-rows-2 xl:overflow-hidden">
          <Panel title="Formula Register" subtitle="Weighted equations returned by the model and used locally each tick" themeName={themeName} right={<IconBadge tag="fx" />}>
            {modelBusy ? (
              <div className="rounded-md border p-3 text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
                Generating formula register from prompt...
              </div>
            ) : !worldModel ? (
              <div className="rounded-md border p-3 text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
                Waiting for generated model formulas.
              </div>
            ) : (
              <div className="space-y-2 pr-1" style={{ maxHeight: "44vh", overflowY: "auto" }}>
                {worldModel.definitions.map((definition) => (
                  <div key={definition.id} className="rounded-md border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{definition.label}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
                        {definition.objective}
                      </div>
                    </div>
                    <div className="mt-2 text-xs" style={{ color: theme.muted }}>
                      {definition.description}
                    </div>
                    <div className="mt-2 rounded-md border px-2 py-1.5 text-[11px] leading-relaxed" style={{ borderColor: theme.border }}>
                      {formulaText(definition)}
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: theme.muted }}>
                      threshold:{" "}
                      {definition.objective === "maximize"
                        ? `min ${definition.threshold.toFixed(1)}`
                        : definition.objective === "minimize"
                          ? `max ${definition.threshold.toFixed(1)}`
                          : definition.objective === "monitor"
                            ? `0 < x < ${definition.threshold.toFixed(1)}F`
                          : "off"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="History Theater"
            subtitle="Switch between normalized raw telemetry and derived world-state streams"
            themeName={themeName}
            right={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTheaterMode("raw")}
                  className="rounded-sm border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]"
                  style={{
                    borderColor: theme.border,
                    background: theaterMode === "raw" ? (obsidian ? theme.accent : theme.subpanel) : "transparent",
                    color: theaterMode === "raw" ? (obsidian ? "#090909" : theme.text) : theme.muted,
                  }}
                >
                  raw
                </button>
                <button
                  onClick={() => setTheaterMode("derived")}
                  className="rounded-sm border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]"
                  style={{
                    borderColor: theme.border,
                    background: theaterMode === "derived" ? (obsidian ? theme.accent : theme.subpanel) : "transparent",
                    color: theaterMode === "derived" ? (obsidian ? "#090909" : theme.text) : theme.muted,
                  }}
                  disabled={!worldModel}
                >
                  derived
                </button>
              </div>
            }
          >
            <SeriesLegend
              series={theaterMode === "raw" ? rawSeries : worldModel ? derivedSeries : []}
              themeName={themeName}
            />
            <div className="h-[38vh] min-h-[250px] w-full lg:h-full">
              {!hydrated ? (
                <div className="grid h-full place-items-center rounded-md border text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
                  Loading chart theater...
                </div>
              ) : theaterMode === "raw" ? (
                <SimpleLineChart
                  data={rawChartData}
                  themeName={themeName}
                  series={rawSeries}
                />
              ) : worldModel ? (
                <SimpleLineChart
                  data={derivedChartData}
                  themeName={themeName}
                  series={derivedSeries}
                />
              ) : (
                <div className="grid h-full place-items-center rounded-md border text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
                  {modelBusy ? "Generating derived stream..." : "Derived stream will appear after model generation."}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <BabyGenomeModal
        open={babyModalOpen}
        loading={babyBusy}
        error={babyError}
        result={babyResult}
        memory={babyMemory}
        themeName={themeName}
        onClose={() => setBabyModalOpen(false)}
      />
    </div>
  );
}
