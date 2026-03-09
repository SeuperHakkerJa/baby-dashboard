import OpenAI from "openai";

import { ensureUniqueProjection, projectBabyTraits, realizeBabyTraits } from "../../../lib/dashboard/baby-realization";
import { sanitizeDiscreteConfigList } from "../../../lib/dashboard/discrete-config";
import { readStrictOpenAIKeyFromEnvLocal } from "../../../lib/dashboard/env";
import { buildBabyGenomePrompt } from "../../../lib/dashboard/baby-genome-prompt";
import { stripJsonCodeFence, parseJsonLoose } from "../../../lib/dashboard/json";
import { isThresholdBreached } from "../../../lib/dashboard/objective";
import type { BabyDiscreteConfig, BabyGenomeRequest, BabyGenomeResponse, BabySnapshot, BabyTraitConfig } from "../../../lib/dashboard/types";

const BABY_MODEL_ID = process.env.OPENAI_BABY_MODEL ?? "gpt-5-nano";
const BABY_TIMEOUT_MS = Number(process.env.OPENAI_BABY_TIMEOUT_MS ?? 18000);
const BABY_MAX_TOKENS = Number(process.env.OPENAI_BABY_MAX_TOKENS ?? 500);
const SURROUNDING_DERIVED_ID = "fixed_surrounding_temperature";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDerivedItem(input: unknown): input is BabySnapshot["derived"][number] {
  if (!input || typeof input !== "object") return false;
  const item = input as Record<string, unknown>;
  const objective = String(item.objective ?? "");
  return (
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    isFiniteNumber(item.value) &&
    isFiniteNumber(item.threshold) &&
    (objective === "maximize" || objective === "minimize" || objective === "none" || objective === "monitor")
  );
}

function isValidSnapshot(input: unknown): input is BabySnapshot {
  if (!input || typeof input !== "object") return false;
  const snapshot = input as Record<string, unknown>;
  const sensors = snapshot.sensors as Record<string, unknown> | undefined;
  const derivedRaw = snapshot.derived;
  const derived = Array.isArray(derivedRaw) ? derivedRaw : null;
  const hasSurrounding = !!derived?.some(
    (item) => isValidDerivedItem(item) && item.id === SURROUNDING_DERIVED_ID
  );
  return (
    typeof snapshot.capturedAt === "string" &&
    isFiniteNumber(snapshot.tick) &&
    isFiniteNumber(snapshot.hotSeconds) &&
    isFiniteNumber(snapshot.monitorThresholdF) &&
    !!sensors &&
    isFiniteNumber(sensors.temperatureF) &&
    isFiniteNumber(sensors.humidityPct) &&
    isFiniteNumber(sensors.lightLevel) &&
    !!derived &&
    derived.every((item) => isValidDerivedItem(item)) &&
    hasSurrounding
  );
}

function sanitizeForbiddenConfigs(input: unknown): BabyDiscreteConfig[] {
  return sanitizeDiscreteConfigList(input);
}

function buildLocalTraits(snapshot: BabySnapshot): BabyTraitConfig {
  const surrounding = snapshot.derived.find((item) => item.id === SURROUNDING_DERIVED_ID);
  const thermalValue = surrounding?.value ?? snapshot.sensors.temperatureF;
  const monitorThreshold = surrounding?.threshold ?? snapshot.monitorThresholdF;
  const thermalDelta = Math.max(0, thermalValue - monitorThreshold);
  const derivedBreaches = snapshot.derived.filter((item) => isThresholdBreached(item.objective, item.value, item.threshold)).length;
  const ambientStress = snapshot.derived.length > 0 ? derivedBreaches / snapshot.derived.length : 0;

  const speed = 1.0 + thermalDelta * 0.05 + snapshot.sensors.humidityPct * 0.004 + ambientStress * 0.45;
  const breathingRate = 16 + thermalDelta * 0.58 + snapshot.sensors.humidityPct * 0.1 + ambientStress * 6;
  const bodySize = 34 + thermalDelta * 0.9 + ambientStress * 8;
  const mode = thermalDelta > 8 || ambientStress > 0.55 ? "heat-shield" : thermalDelta > 3 ? "balanced" : "conserve";

  return { speed, breathingRate, bodySize, mode };
}

function buildLocalInterpretation(snapshot: BabySnapshot) {
  const tempState = snapshot.derived.find((item) => item.id === "fixed_surrounding_temperature");
  const lightState = snapshot.derived.find((item) => item.id === "fixed_photon_flux");
  const heatBreached = !!tempState && (tempState.value <= 0 || tempState.value >= tempState.threshold);
  const lightBreached = !!lightState && lightState.value > lightState.threshold;

  const regime = heatBreached && lightBreached
    ? "heat and photon overload"
    : heatBreached
      ? "thermal overload"
      : lightBreached
        ? "photon overload"
        : "rising environmental stress";

  return `Current body cannot safely sustain ${regime}; birth should create a successor body specialized for this regime, with stronger stress tolerance, faster recovery, and stable operation under persistent exposure.`;
}

function normalizeInterpretation(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const words = compact.split(" ").filter(Boolean);
  return words.slice(0, 40).join(" ");
}

function sanitizeInterpretation(candidate: unknown, fallback: string) {
  if (!candidate) return fallback;
  if (typeof candidate === "string") {
    const normalized = normalizeInterpretation(candidate);
    return normalized || fallback;
  }
  if (typeof candidate !== "object") return fallback;

  const root = candidate as Record<string, unknown>;
  const picks = [root.interpretation, root.story, root.summary];
  for (const pick of picks) {
    if (typeof pick !== "string") continue;
    const normalized = normalizeInterpretation(pick);
    if (normalized) return normalized;
  }

  return fallback;
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const body = (await req.json()) as BabyGenomeRequest;
    const snapshot = body.snapshot;
    const forbiddenConfigs = sanitizeForbiddenConfigs(body.forbiddenConfigs);
    if (!isValidSnapshot(snapshot)) {
      return Response.json(
        { error: "Valid snapshot is required (including derived world-model states with fixed_surrounding_temperature)." },
        { status: 400 }
      );
    }

    const localProposed = buildLocalTraits(snapshot);
    const localRealized = realizeBabyTraits(localProposed);
    const localProjectionBase = projectBabyTraits(snapshot, localRealized);
    const localProjectionResult = ensureUniqueProjection(localProjectionBase, forbiddenConfigs);
    const localInterpretation = buildLocalInterpretation(snapshot);

    const strictKey = readStrictOpenAIKeyFromEnvLocal();
    const client = strictKey ? new OpenAI({ apiKey: strictKey }) : null;
    if (!client) {
      const response: BabyGenomeResponse = {
        source: "local",
        snapshot,
        interpretation: localInterpretation,
        proposed: localProposed,
        realizedTraits: localRealized,
        realizedProjection: localProjectionResult.projection,
        warning: localProjectionResult.adjusted
          ? "OPENAI_API_KEY missing; local projection adjusted to avoid forbidden configs"
          : "OPENAI_API_KEY missing in .env.local",
        debug: {
          provider: "local",
          modelId: "local-fallback",
          keySource: "none",
          latencyMs: Date.now() - startedAt,
        },
      };
      return Response.json(response);
    }

    const result = await client.responses.create(
      {
        model: BABY_MODEL_ID,
        input: buildBabyGenomePrompt(snapshot, forbiddenConfigs),
        max_output_tokens: BABY_MAX_TOKENS,
        store: false,
        reasoning: { effort: "minimal" },
        text: {
          format: { type: "json_object" },
          verbosity: "low",
        },
      },
      {
        timeout: BABY_TIMEOUT_MS,
      }
    );

    const cleaned = stripJsonCodeFence(result.output_text ?? "");
    const parsed = cleaned ? parseJsonLoose(cleaned) : null;
    const interpretation = sanitizeInterpretation(parsed, localInterpretation);
    const projectionBase = projectBabyTraits(snapshot, localRealized);
    const projectionResult = ensureUniqueProjection(projectionBase, forbiddenConfigs);

    const response: BabyGenomeResponse = {
      source: "openai",
      snapshot,
      interpretation,
      proposed: localProposed,
      realizedTraits: localRealized,
      realizedProjection: projectionResult.projection,
      warning: !parsed
        ? "OpenAI returned invalid/empty JSON; interpretation text fell back to local synthesis"
        : projectionResult.adjusted
          ? "Projected config adjusted to avoid previous baby config"
          : undefined,
      debug: {
        provider: "openai",
        modelId: BABY_MODEL_ID,
        keySource: "env.local",
        responseId: result.id,
        latencyMs: Date.now() - startedAt,
        incompleteReason: result.incomplete_details?.reason ?? null,
      },
    };
    return Response.json(response);
  } catch (error) {
    if (error instanceof Error && /timeout|aborted/i.test(error.message)) {
      return Response.json({ error: `Baby genome request timed out after ${BABY_TIMEOUT_MS}ms` }, { status: 504 });
    }
    const message = error instanceof Error ? error.message : "Unknown baby genome generation error";
    return Response.json({ error: message }, { status: 500 });
  }
}
