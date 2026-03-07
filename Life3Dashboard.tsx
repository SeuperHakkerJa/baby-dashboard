"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { aggregateScore, evaluateWorldModel, synthesizeGenomeCandidate } from "./lib/dashboard/decision";
import {
  buildLocalWorldModel,
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

const DESKTOP_THEME_OPTIONS: ThemeName[] = ["Cipher", "Zenith", "Quartz", "Tidal", "Lumen"];
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

function panelGlow(themeName: ThemeName) {
  const map: Record<ThemeName, string> = {
    Cipher: "0 30px 90px rgba(15, 23, 42, 0.45)",
    Zenith: "0 28px 80px rgba(12, 65, 95, 0.34)",
    Quartz: "0 28px 80px rgba(76, 35, 92, 0.34)",
    Tidal: "0 28px 80px rgba(21, 80, 76, 0.34)",
    Lumen: "0 28px 80px rgba(92, 67, 20, 0.34)",
  };

  return map[themeName];
}

function classifiedScan(themeName: ThemeName) {
  if (themeName !== "Cipher") return "transparent";

  return "repeating-linear-gradient(0deg, rgba(148,163,184,0.06) 0px, rgba(148,163,184,0.06) 1px, transparent 1px, transparent 4px)";
}

function classifiedGrid(themeName: ThemeName) {
  if (themeName !== "Cipher") return "transparent";

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

function WorldModelModal({
  open,
  onClose,
  json,
  themeName,
}: {
  open: boolean;
  onClose: () => void;
  json: Record<string, unknown> | null;
  themeName: ThemeName;
}) {
  const theme = THEMES[themeName];

  if (!open || !json) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-[1.7rem] border p-4 md:p-5"
        style={{
          background: theme.panel,
          borderColor: theme.border,
          color: theme.text,
          boxShadow: panelGlow(themeName),
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: theme.muted }}>
              Birth Window Output
            </div>
            <h3 className="mt-1 text-xl font-semibold">AI-Derived Genome Candidate</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border px-3 py-1.5 text-xs uppercase tracking-[0.2em]"
            style={{ borderColor: theme.border }}
          >
            close
          </button>
        </div>
        <div className="rounded-2xl border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
          <pre className="max-h-[60vh] overflow-auto text-xs leading-6">{JSON.stringify(json, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  right,
  themeName,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  themeName: ThemeName;
  children: React.ReactNode;
}) {
  const theme = THEMES[themeName];
  const frameClass =
    themeName === "Cipher" ? "min-h-0 rounded-xl border p-4 md:p-5" : "min-h-0 rounded-[1.5rem] border p-4 md:p-5";

  return (
    <section
      className={frameClass}
      style={{
        background: theme.panel,
        borderColor: theme.border,
        boxShadow: panelGlow(themeName),
        outline: themeName === "Cipher" ? "1px solid rgba(148,163,184,0.14)" : "none",
        outlineOffset: themeName === "Cipher" ? "-6px" : "0px",
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
      <div className="min-h-0">{children}</div>
    </section>
  );
}

function IconBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-md border px-1 text-[9px] font-semibold uppercase tracking-[0.08em] opacity-85">
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
  const shellClass = themeName === "Cipher" ? "rounded-xl border p-3" : "rounded-2xl border p-3";

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
  const shellClass = themeName === "Cipher" ? "rounded-xl border p-3" : "rounded-2xl border p-3";

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
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
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
  color: string;
  strokeWidth?: number;
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
      <div className="grid h-full place-items-center rounded-2xl border text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
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
    <svg className="h-full w-full rounded-2xl border" style={{ borderColor: theme.border, background: theme.subpanel }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0, 25, 50, 75, 100].map((level) => (
        <line key={level} x1={padX} x2={width - padX} y1={y(level)} y2={y(level)} stroke={theme.border} strokeDasharray="4 4" strokeWidth="1" />
      ))}
      {series.map((item) => (
        <polyline
          key={item.key}
          points={pointsFor(item.key)}
          fill="none"
          stroke={item.color}
          strokeWidth={item.strokeWidth ?? 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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

export default function Life3Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [themeName, setThemeName] = useState<ThemeName>("Cipher");
  const [prompt, setPrompt] = useState("");
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  const [modelTrace, setModelTrace] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState<"idle" | "openai" | "local">("idle");
  const [theaterMode, setTheaterMode] = useState<TheaterMode>("raw");
  const [worldModel, setWorldModel] = useState<WorldModelSpec | null>(null);
  const [showGenomeModal, setShowGenomeModal] = useState(false);
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

  const candidateGenome = useMemo(() => {
    if (!worldModel || !forecast.birthWindowOpen) return null;
    return synthesizeGenomeCandidate(worldModel, frame.sensors, currentDerived, forecast);
  }, [currentDerived, forecast, frame.sensors, worldModel]);

  const birthRef = useRef(false);
  useEffect(() => {
    if (forecast.birthWindowOpen && !birthRef.current) {
      setShowGenomeModal(true);
    }
    birthRef.current = forecast.birthWindowOpen;
  }, [forecast.birthWindowOpen]);

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
    setModelWarning("Generating preview now. Replacing with OpenAI response when ready...");
    setModelTrace(null);
    setShowGenomeModal(false);
    setTheaterMode("derived");

    const previewModel = buildLocalWorldModel(trimmed);
    setModelSource("local");
    setWorldModel(previewModel);
    setFrame((prev) => {
      const derivedHistory = prev.rawHistory.map((point) => {
        const snapshot = computeDerivedSnapshot(previewModel.definitions, point.sensors);
        return buildDerivedPoint(point.label, snapshot);
      });
      return {
        ...prev,
        derivedHistory,
      };
    });

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
    setShowGenomeModal(false);
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

  const leadingDerived = useMemo(() => worldModel?.definitions.slice(0, 3) ?? [], [worldModel]);

  const derivedChartData = useMemo(
    () =>
      frame.derivedHistory.slice(-STREAM_WINDOW).map((point) => {
        const row: Record<string, string | number> = {
          t: point.label,
          aggregate: point.aggregate,
        };

        for (const item of leadingDerived) {
          row[item.id] = Number((point.values[item.id] ?? 0).toFixed(1));
        }

        return row;
      }),
    [frame.derivedHistory, leadingDerived]
  );

  const theme = THEMES[themeName];
  const boardIdle = !worldModel;
  const derivedStatusText = boardIdle ? "derived idle" : `${worldModel.definitions.length} derived states`;

  return (
    <div className="h-[100dvh] overflow-x-hidden overflow-y-auto p-3 md:p-4" style={{ background: theme.canvas, color: theme.text }}>
      <div className="pointer-events-none fixed inset-0" style={{ backgroundImage: theme.mesh, opacity: 0.78 }} />
      <div
        className="pointer-events-none fixed inset-0"
        style={{ backgroundImage: classifiedGrid(themeName), backgroundSize: "34px 34px", opacity: 0.45 }}
      />
      <div className="pointer-events-none fixed inset-0" style={{ backgroundImage: classifiedScan(themeName), opacity: 0.36, mixBlendMode: "screen" }} />

      {themeName === "Cipher" ? (
        <div className="pointer-events-none fixed left-3 top-3 z-20 rounded-md border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ borderColor: theme.border, background: "rgba(8,13,16,0.78)", color: theme.muted }}>
          clearance omega | classified systems theater
        </div>
      ) : null}

      <div className="relative z-10 mx-auto grid w-full max-w-[1700px] grid-cols-1 gap-4 xl:min-h-[calc(100dvh-2rem)] xl:grid-cols-12">
        <div className="grid min-h-0 gap-4 xl:col-span-8 xl:grid-rows-[auto_auto_1fr]">
          <Panel
            title="Mother Interface"
            subtitle="Monitor-only board: measured sensors, derived world model, and live theater history"
            themeName={themeName}
            right={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {DESKTOP_THEME_OPTIONS.map((name) => (
                  <button
                    key={name}
                    onClick={() => setThemeName(name)}
                    className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
                    style={{
                      borderColor: theme.border,
                      color: themeName === name ? theme.text : theme.muted,
                      background: themeName === name ? theme.subpanel : "transparent",
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]" style={{ color: theme.muted }}>
                  <IconBadge tag="rs" /> raw stream
                </div>
                <div className="mt-2 text-2xl font-semibold">live</div>
              </div>
              <div className="rounded-2xl border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]" style={{ color: theme.muted }}>
                  <IconBadge tag="ds" /> derived model
                </div>
                <div className="mt-2 text-2xl font-semibold">{derivedStatusText}</div>
              </div>
              <div className="rounded-2xl border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]" style={{ color: theme.muted }}>
                  <IconBadge tag="th" /> theater mode
                </div>
                <div className="mt-2 text-2xl font-semibold">{theaterMode}</div>
              </div>
              <div className="rounded-2xl border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]" style={{ color: theme.muted }}>
                  <IconBadge tag="pt" /> points
                </div>
                <div className="mt-2 text-2xl font-semibold">{frame.rawHistory.length}</div>
              </div>
            </div>
          </Panel>

          <div className="grid min-h-0 gap-4 lg:grid-cols-2">
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
                <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.border }}>
                  <div style={{ color: theme.muted }}>angle</div>
                  <div className="font-semibold">{`${actuators.angleDeg.toFixed(1)} ${ACTUATOR_RANGES.angleDeg.unit}`}</div>
                </div>
                <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.border }}>
                  <div style={{ color: theme.muted }}>light color</div>
                  <div className="font-semibold">{`${actuators.lightHue.toFixed(1)} ${ACTUATOR_RANGES.lightHue.unit}`}</div>
                </div>
                <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.border }}>
                  <div style={{ color: theme.muted }}>light frequency</div>
                  <div className="font-semibold">{`${actuators.lightFrequencyHz.toFixed(2)} ${ACTUATOR_RANGES.lightFrequencyHz.unit}`}</div>
                </div>
                <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.border }}>
                  <div style={{ color: theme.muted }}>pump speed</div>
                  <div className="font-semibold">{`${actuators.pumpSpeedPct.toFixed(1)} ${ACTUATOR_RANGES.pumpSpeedPct.unit}`}</div>
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
                className="h-32 w-full resize-none rounded-2xl border px-3 py-2 text-sm outline-none"
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
                  className="rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] disabled:cursor-not-allowed disabled:opacity-55"
                  style={{ borderColor: theme.border, background: theme.subpanel }}
                >
                  {modelBusy ? "generating..." : "generate world model"}
                </button>
                <button
                  onClick={clearWorldModel}
                  disabled={!worldModel}
                  className="rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ borderColor: theme.border }}
                >
                  clear
                </button>
                <div className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]" style={{ borderColor: theme.border }}>
                  model {modelSource}
                </div>
                <div className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em]" style={{ borderColor: theme.border }}>
                  {derivedStatusText}
                </div>
                {candidateGenome ? (
                  <button
                    onClick={() => setShowGenomeModal(true)}
                    className="rounded-xl border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
                    style={{ borderColor: theme.border, background: theme.subpanel }}
                  >
                    view genome json
                  </button>
                ) : null}
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

          <div ref={derivedPanelRef}>
            <Panel
              title="Derived World State"
              subtitle="Computed from AI-returned weighted formulas over live sensor values"
              themeName={themeName}
              right={<IconBadge tag="ai" />}
            >
              {!worldModel ? (
                <div className="grid h-full min-h-[240px] place-items-center rounded-2xl border" style={{ borderColor: theme.border, background: theme.subpanel }}>
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

        <div className="grid min-h-0 gap-4 xl:col-span-4 xl:grid-rows-[auto_1fr]">
          <Panel
            title="Formula Register"
            subtitle="Weighted equations returned by the model and used locally each tick"
            themeName={themeName}
            right={<IconBadge tag="fx" />}
          >
            {!worldModel ? (
              <div className="rounded-2xl border p-3 text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
                Waiting for generated model formulas.
              </div>
            ) : (
              <div className="max-h-[30vh] space-y-2 overflow-auto pr-1">
                {worldModel.definitions.map((definition) => (
                  <div key={definition.id} className="rounded-2xl border p-3" style={{ borderColor: theme.border, background: theme.subpanel }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{definition.label}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
                        {definition.objective}
                      </div>
                    </div>
                    <div className="mt-2 text-xs" style={{ color: theme.muted }}>
                      {definition.description}
                    </div>
                    <div className="mt-2 rounded-xl border px-2 py-1.5 text-[11px] leading-relaxed" style={{ borderColor: theme.border }}>
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
                  className="rounded-lg border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]"
                  style={{
                    borderColor: theme.border,
                    background: theaterMode === "raw" ? theme.subpanel : "transparent",
                    color: theaterMode === "raw" ? theme.text : theme.muted,
                  }}
                >
                  raw
                </button>
                <button
                  onClick={() => setTheaterMode("derived")}
                  className="rounded-lg border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]"
                  style={{
                    borderColor: theme.border,
                    background: theaterMode === "derived" ? theme.subpanel : "transparent",
                    color: theaterMode === "derived" ? theme.text : theme.muted,
                  }}
                  disabled={!worldModel}
                >
                  derived
                </button>
              </div>
            }
          >
            <div className="h-[38vh] min-h-[250px] w-full lg:h-full">
              {!hydrated ? (
                <div className="grid h-full place-items-center rounded-2xl border text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
                  Loading chart theater...
                </div>
              ) : theaterMode === "raw" ? (
                <SimpleLineChart
                  data={rawChartData}
                  themeName={themeName}
                  series={[
                    { key: "lightLux", color: theme.chartA, strokeWidth: 2 },
                    { key: "cameraColorK", color: theme.chartB, strokeWidth: 2 },
                    { key: "acousticDb", color: theme.chartC, strokeWidth: 2 },
                    { key: "temperatureC", color: theme.accentAlt, strokeWidth: 2 },
                  ]}
                />
              ) : worldModel ? (
                <SimpleLineChart
                  data={derivedChartData}
                  themeName={themeName}
                  series={[
                    { key: "aggregate", color: theme.accent, strokeWidth: 2.2 },
                    ...leadingDerived.map((item, index) => ({
                      key: item.id,
                      color: index === 0 ? theme.chartA : index === 1 ? theme.chartB : theme.chartC,
                      strokeWidth: 1.8,
                    })),
                  ]}
                />
              ) : (
                <div className="grid h-full place-items-center rounded-2xl border text-sm" style={{ borderColor: theme.border, background: theme.subpanel, color: theme.muted }}>
                  Derived stream will appear after model generation.
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.border }}>
                <div style={{ color: theme.muted }}>raw points</div>
                <div className="font-semibold">{frame.rawHistory.length}</div>
              </div>
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.border }}>
                <div style={{ color: theme.muted }}>derived points</div>
                <div className="font-semibold">{boardIdle ? "--" : frame.derivedHistory.length}</div>
              </div>
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.border }}>
                <div style={{ color: theme.muted }}>model source</div>
                <div className="font-semibold">{modelSource}</div>
              </div>
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.border }}>
                <div style={{ color: theme.muted }}>tick</div>
                <div className="font-semibold">{frame.tick}</div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <WorldModelModal
        open={showGenomeModal}
        onClose={() => setShowGenomeModal(false)}
        json={candidateGenome as Record<string, unknown> | null}
        themeName={themeName}
      />

      <div className="mt-2 px-1 text-[11px] uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
        {boardIdle
          ? themeName === "Cipher"
            ? "raw stream live | derived idle"
            : "raw stream running | derived idle"
          : themeName === "Cipher"
          ? "raw + derived streams live | classified monitor bus"
          : "raw + derived streams running | monitor-only interface"}
      </div>
    </div>
  );
}
