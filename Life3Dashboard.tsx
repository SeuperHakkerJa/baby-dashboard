"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { aggregateScore, evaluateWorldModel } from "./lib/dashboard/decision";
import {
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
import type { SensorInput, ThemeName, WorldModelResponse, WorldModelSpec } from "./lib/dashboard/types";

type TheaterMode = "raw" | "derived";

type FrameState = {
  tick: number;
  sensors: SensorInput;
  rawHistory: Array<{ label: string; sensors: SensorInput }>;
  derivedHistory: DerivedHistoryPoint[];
};

const STREAM_WINDOW = 120;

const ACTUATOR_RANGES = {
  angleDeg: { min: 0, max: 180, unit: "°" },
  lightHue: { min: 0, max: 360, unit: "hue" },
  lightFrequencyHz: { min: 0.2, max: 9, unit: "Hz" },
  pumpSpeedPct: { min: 0, max: 100, unit: "%" },
};

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

function computeActuatorOutput(sensors: SensorInput, hazard: number) {
  const angleDeg = clamp(90 + (sensors.lightLux - 520) * 0.045 - (sensors.acousticDb - 34) * 0.58, 6, 174);
  const lightHue = clamp(215 - (sensors.cameraColorK - 5000) / 24 + hazard * 0.36, 0, 360);
  const lightFrequencyHz = clamp(0.8 + hazard * 0.052, 0.2, 8.8);
  const pumpSpeedPct = clamp(34 + (sensors.temperatureC - 24) * 4.2 + hazard * 0.38, 0, 100);

  return {
    angleDeg: Number(angleDeg.toFixed(1)),
    lightHue: Number(lightHue.toFixed(1)),
    lightFrequencyHz: Number(lightFrequencyHz.toFixed(2)),
    pumpSpeedPct: Number(pumpSpeedPct.toFixed(1)),
  };
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
  const frameClass =
    isClassifiedTheme(themeName) ? "min-h-0 rounded-md border p-4 md:p-5" : "min-h-0 rounded-md border p-4 md:p-5";

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
  percent,
  themeName,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  unit: string;
  range: string;
  percent: number;
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
        {value !== "--" ? (
          <span className="ml-1 text-sm font-medium" style={{ color: theme.muted }}>
            {unit}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: theme.muted }}>
        {range}
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/10">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${Math.max(2, percent)}%`, background: theme.accent }}
        />
      </div>
    </div>
  );
}

function DerivedCard({
  label,
  description,
  objective,
  value,
  themeName,
}: {
  label: string;
  description: string;
  objective: "maximize" | "minimize";
  value: number;
  themeName: ThemeName;
}) {
  const theme = THEMES[themeName];
  const normalized = objective === "maximize" ? value : 100 - value;
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
            color: objective === "maximize" ? "#6ee7b7" : "#fda4af",
            background: objective === "maximize" ? "rgba(16,185,129,0.16)" : "rgba(244,63,94,0.14)",
          }}
        >
          {objective}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold">{value.toFixed(1)}</div>
        <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
          aligned {normalized.toFixed(1)}%
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/10">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${Math.max(2, normalized)}%`, background: theme.accentAlt }}
        />
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

  const y = (value: number) => {
    const normalized = clamp(value, 0, 100) / 100;
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
      {[0, 25, 50, 75, 100].map((level) => (
        <line key={level} x1={padX} x2={width - padX} y1={y(level)} y2={y(level)} stroke={theme.border} strokeDasharray="4 4" strokeWidth="1" />
      ))}
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

  const forecast = useMemo(() => evaluateWorldModel(frame.derivedHistory, currentDerived), [currentDerived, frame.derivedHistory]);

  const actuatorHazard = worldModel ? forecast.hazard : 35;
  const actuators = useMemo(
    () => computeActuatorOutput(frame.sensors, actuatorHazard),
    [actuatorHazard, frame.sensors]
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!worldModel) return;
    derivedPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [worldModel?.generatedAt]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((prev) => {
        const nextTick = prev.tick + 1;
        const nextSensors = simulateSensorStep(prev.sensors);
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
  }, [worldModel]);

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
        lightLux: Number(sensorPercent("lightLux", point.sensors.lightLux).toFixed(1)),
        cameraColorK: Number(sensorPercent("cameraColorK", point.sensors.cameraColorK).toFixed(1)),
        acousticDb: Number(sensorPercent("acousticDb", point.sensors.acousticDb).toFixed(1)),
        temperatureC: Number(sensorPercent("temperatureC", point.sensors.temperatureC).toFixed(1)),
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
      { key: "lightLux", label: "Light", color: "#00e5ff", strokeWidth: 2.3, dasharray: "0" },
      { key: "cameraColorK", label: "Camera", color: "#ff4dff", strokeWidth: 2.1, dasharray: "10 6" },
      { key: "acousticDb", label: "Acoustic", color: "#7dff7a", strokeWidth: 2.1, dasharray: "4 5" },
      { key: "temperatureC", label: "Temp", color: "#f7f7f7", strokeWidth: 2.2, dasharray: "14 6" },
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
              right={<IconBadge tag="in" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <SensorCard
                  label={SENSOR_INPUT_SCHEMA.lightLux.label}
                  icon={<IconBadge tag="lx" />}
                  value={formatValue(frame.sensors.lightLux)}
                  unit={SENSOR_INPUT_SCHEMA.lightLux.unit}
                  range={`${SENSOR_INPUT_SCHEMA.lightLux.min}-${SENSOR_INPUT_SCHEMA.lightLux.max}`}
                  percent={sensorPercent("lightLux", frame.sensors.lightLux)}
                  themeName={themeName}
                />
                <SensorCard
                  label={SENSOR_INPUT_SCHEMA.cameraColorK.label}
                  icon={<IconBadge tag="cam" />}
                  value={formatValue(frame.sensors.cameraColorK, 0)}
                  unit={SENSOR_INPUT_SCHEMA.cameraColorK.unit}
                  range={`${SENSOR_INPUT_SCHEMA.cameraColorK.min}-${SENSOR_INPUT_SCHEMA.cameraColorK.max}`}
                  percent={sensorPercent("cameraColorK", frame.sensors.cameraColorK)}
                  themeName={themeName}
                />
                <SensorCard
                  label={SENSOR_INPUT_SCHEMA.acousticDb.label}
                  icon={<IconBadge tag="db" />}
                  value={formatValue(frame.sensors.acousticDb)}
                  unit={SENSOR_INPUT_SCHEMA.acousticDb.unit}
                  range={`${SENSOR_INPUT_SCHEMA.acousticDb.min}-${SENSOR_INPUT_SCHEMA.acousticDb.max}`}
                  percent={sensorPercent("acousticDb", frame.sensors.acousticDb)}
                  themeName={themeName}
                />
                <SensorCard
                  label={SENSOR_INPUT_SCHEMA.temperatureC.label}
                  icon={<IconBadge tag="tmp" />}
                  value={formatValue(frame.sensors.temperatureC)}
                  unit={SENSOR_INPUT_SCHEMA.temperatureC.unit}
                  range={`${SENSOR_INPUT_SCHEMA.temperatureC.min}-${SENSOR_INPUT_SCHEMA.temperatureC.max}`}
                  percent={sensorPercent("temperatureC", frame.sensors.temperatureC)}
                  themeName={themeName}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div className="h-full rounded-md border px-3 py-2" style={{ borderColor: theme.border }}>
                  <div className="min-h-[2rem] leading-tight" style={{ color: theme.muted }}>
                    angle
                  </div>
                  <div className="font-semibold whitespace-nowrap">{`${actuators.angleDeg.toFixed(1)} ${ACTUATOR_RANGES.angleDeg.unit}`}</div>
                </div>
                <div className="h-full rounded-md border px-3 py-2" style={{ borderColor: theme.border }}>
                  <div className="min-h-[2rem] leading-tight" style={{ color: theme.muted }}>
                    light color
                  </div>
                  <div className="font-semibold whitespace-nowrap">{`${actuators.lightHue.toFixed(1)} ${ACTUATOR_RANGES.lightHue.unit}`}</div>
                </div>
                <div className="h-full rounded-md border px-3 py-2" style={{ borderColor: theme.border }}>
                  <div className="min-h-[2rem] leading-tight" style={{ color: theme.muted }}>
                    light frequency
                  </div>
                  <div className="font-semibold whitespace-nowrap">{`${actuators.lightFrequencyHz.toFixed(2)} ${ACTUATOR_RANGES.lightFrequencyHz.unit}`}</div>
                </div>
                <div className="h-full rounded-md border px-3 py-2" style={{ borderColor: theme.border }}>
                  <div className="min-h-[2rem] leading-tight" style={{ color: theme.muted }}>
                    pump speed
                  </div>
                  <div className="font-semibold whitespace-nowrap">{`${actuators.pumpSpeedPct.toFixed(1)} ${ACTUATOR_RANGES.pumpSpeedPct.unit}`}</div>
                </div>
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
                <div className="grid h-full min-h-[240px] place-items-center rounded-md border" style={{ borderColor: theme.border, background: theme.subpanel }}>
                  <div className="max-w-xl text-center">
                    <div className="text-sm font-semibold uppercase tracking-[0.25em]">generating</div>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.muted }}>
                      Building derived world model from your prompt. Waiting for model output before rendering derived states.
                    </p>
                  </div>
                </div>
              ) : !worldModel ? (
                <div className="grid h-full min-h-[240px] place-items-center rounded-md border" style={{ borderColor: theme.border, background: theme.subpanel }}>
                  <div className="max-w-xl text-center">
                    <div className="text-sm font-semibold uppercase tracking-[0.25em]">idle</div>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.muted }}>
                      Provide a prompt and generate the world model. The board will then load 4-6 derived states and continuously compute them from the raw sensor stream.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {currentDerived.map((item) => (
                    <DerivedCard
                      key={item.id}
                      label={item.label}
                      description={item.description}
                      objective={item.objective}
                      value={item.value}
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
            <div className="h-[32vh] min-h-[220px] w-full xl:h-full">
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

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div className="rounded-md border px-3 py-2" style={{ borderColor: theme.border }}>
                <div style={{ color: theme.muted }}>raw points</div>
                <div className="font-semibold">{frame.rawHistory.length}</div>
              </div>
              <div className="rounded-md border px-3 py-2" style={{ borderColor: theme.border }}>
                <div style={{ color: theme.muted }}>derived points</div>
                <div className="font-semibold">{boardIdle ? "--" : frame.derivedHistory.length}</div>
              </div>
              <div className="rounded-md border px-3 py-2" style={{ borderColor: theme.border }}>
                <div style={{ color: theme.muted }}>model source</div>
                <div className="font-semibold">{modelSource}</div>
              </div>
              <div className="rounded-md border px-3 py-2" style={{ borderColor: theme.border }}>
                <div style={{ color: theme.muted }}>tick</div>
                <div className="font-semibold">{frame.tick}</div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
