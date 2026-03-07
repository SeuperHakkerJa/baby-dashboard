import OpenAI from "openai";

import { projectBabyTraits, realizeBabyTraits } from "../../../lib/dashboard/baby-realization";
import { readStrictOpenAIKeyFromEnvLocal } from "../../../lib/dashboard/env";
import { buildBabyGenomePrompt } from "../../../lib/dashboard/baby-genome-prompt";
import type { BabyGenomeResponse, BabySnapshot, BabyTraitConfig } from "../../../lib/dashboard/types";

const BABY_MODEL_ID = process.env.OPENAI_BABY_MODEL ?? "gpt-5-nano";
const BABY_TIMEOUT_MS = Number(process.env.OPENAI_BABY_TIMEOUT_MS ?? 18000);
const BABY_MAX_TOKENS = Number(process.env.OPENAI_BABY_MAX_TOKENS ?? 500);

function parseJsonLoose(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidSnapshot(input: unknown): input is BabySnapshot {
  if (!input || typeof input !== "object") return false;
  const snapshot = input as Record<string, unknown>;
  const sensors = snapshot.sensors as Record<string, unknown> | undefined;
  return (
    typeof snapshot.capturedAt === "string" &&
    isFiniteNumber(snapshot.tick) &&
    isFiniteNumber(snapshot.hotSeconds) &&
    isFiniteNumber(snapshot.monitorThresholdF) &&
    !!sensors &&
    isFiniteNumber(sensors.temperatureF) &&
    isFiniteNumber(sensors.cameraR) &&
    isFiniteNumber(sensors.cameraG) &&
    isFiniteNumber(sensors.cameraB) &&
    isFiniteNumber(sensors.acousticDb)
  );
}

function buildLocalTraits(snapshot: BabySnapshot): BabyTraitConfig {
  const thermalDelta = Math.max(0, snapshot.sensors.temperatureF - snapshot.monitorThresholdF);
  const speed = 1.0 + thermalDelta * 0.06 + snapshot.sensors.acousticDb * 0.008;
  const breathingRate = 16 + thermalDelta * 0.6 + snapshot.sensors.acousticDb * 0.18;
  const bodySize = 34 + thermalDelta * 0.92;
  const mode = thermalDelta > 8 ? "heat-shield" : thermalDelta > 3 ? "balanced" : "conserve";

  return { speed, breathingRate, bodySize, mode };
}

function sanitizeTraits(candidate: unknown, fallback: BabyTraitConfig): BabyTraitConfig {
  if (!candidate || typeof candidate !== "object") return fallback;
  const root = candidate as Record<string, unknown>;
  const raw = (root.traits && typeof root.traits === "object" ? root.traits : root) as Record<string, unknown>;
  return {
    speed: Number(raw.speed ?? fallback.speed),
    breathingRate: Number(raw.breathingRate ?? fallback.breathingRate),
    bodySize: Number(raw.bodySize ?? fallback.bodySize),
    mode: String(raw.mode ?? fallback.mode) as BabyTraitConfig["mode"],
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const body = (await req.json()) as { snapshot?: BabySnapshot };
    const snapshot = body.snapshot;
    if (!isValidSnapshot(snapshot)) {
      return Response.json({ error: "Valid snapshot is required" }, { status: 400 });
    }

    const localProposed = buildLocalTraits(snapshot);
    const localRealized = realizeBabyTraits(localProposed);
    const localProjection = projectBabyTraits(snapshot, localRealized);

    const strictKey = readStrictOpenAIKeyFromEnvLocal();
    const client = strictKey ? new OpenAI({ apiKey: strictKey }) : null;
    if (!client) {
      const response: BabyGenomeResponse = {
        source: "local",
        snapshot,
        proposed: localProposed,
        realizedTraits: localRealized,
        realizedProjection: localProjection,
        warning: "OPENAI_API_KEY missing in .env.local",
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
        input: buildBabyGenomePrompt(snapshot),
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

    const cleaned = (result.output_text ?? "").replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = cleaned ? parseJsonLoose(cleaned) : null;
    const proposed = realizeBabyTraits(sanitizeTraits(parsed, localProposed));
    const projection = projectBabyTraits(snapshot, proposed);

    const response: BabyGenomeResponse = {
      source: "openai",
      snapshot,
      proposed: sanitizeTraits(parsed, localProposed),
      realizedTraits: proposed,
      realizedProjection: projection,
      warning: parsed ? undefined : "OpenAI returned invalid/empty JSON; values normalized from local fallback",
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
