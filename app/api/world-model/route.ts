import OpenAI from "openai";

import { readStrictOpenAIKeyFromEnvLocal } from "../../../lib/dashboard/env";
import { buildLocalWorldModel, sanitizeWorldModel } from "../../../lib/dashboard/pipeline";
import type { WorldModelResponse } from "../../../lib/dashboard/types";

const WORLD_MODEL_ID = process.env.OPENAI_WORLD_MODEL ?? "gpt-5-nano";
const WORLD_MODEL_TIMEOUT_MS = Number(process.env.OPENAI_WORLD_TIMEOUT_MS ?? 18000);
const WORLD_MODEL_MAX_TOKENS = Number(process.env.OPENAI_WORLD_MAX_TOKENS ?? 800);

function promptTemplate(userPrompt: string) {
  return `Return compact JSON only (no markdown):
{
  "title": string,
  "definitions": [
    {
      "id": string,
      "label": string,
      "description": string,
      "objective": "maximize" | "minimize",
      "weights": {
        "lightLux": number,
        "cameraColorK": number,
        "acousticDb": number,
        "temperatureC": number
      },
      "bias": number
    }
  ]
}

Rules:
- 4-6 definitions only
- weights in [-1.5, 1.5]
- bias in [0, 60]
- concise labels/descriptions

User prompt: ${userPrompt}`;
}

function parseJsonLoose(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const slice = text.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }

    return null;
  }
}

export async function POST(req: Request) {
  let prompt = "";
  const startedAt = Date.now();

  try {
    const body = (await req.json()) as { prompt?: string };
    prompt = body.prompt?.trim() ?? "";

    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const fallback = buildLocalWorldModel(prompt);
    const strictKey = readStrictOpenAIKeyFromEnvLocal();
    const client = strictKey ? new OpenAI({ apiKey: strictKey }) : null;

    if (!client) {
      const response: WorldModelResponse = {
        source: "local",
        model: fallback,
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
        model: WORLD_MODEL_ID,
        input: promptTemplate(prompt),
        max_output_tokens: WORLD_MODEL_MAX_TOKENS,
        store: false,
        reasoning: { effort: "minimal" },
        text: {
          format: { type: "json_object" },
          verbosity: "low",
        },
      },
      {
        timeout: WORLD_MODEL_TIMEOUT_MS,
      }
    );

    const outputText = result.output_text?.trim() ?? "";
    const cleaned = outputText.replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();

    if (!cleaned) {
      const response: WorldModelResponse = {
        source: "local",
        model: fallback,
        warning:
          result.incomplete_details?.reason === "max_output_tokens"
            ? "OpenAI output hit token limit; using local fallback"
            : "Empty model output",
        debug: {
          provider: "openai",
          modelId: WORLD_MODEL_ID,
          keySource: "env.local",
          responseId: result.id,
          latencyMs: Date.now() - startedAt,
          incompleteReason: result.incomplete_details?.reason ?? null,
        },
      };
      return Response.json(response);
    }

    const parsed = parseJsonLoose(cleaned);
    if (!parsed) {
      const response: WorldModelResponse = {
        source: "local",
        model: fallback,
        warning:
          result.incomplete_details?.reason === "max_output_tokens"
            ? "OpenAI JSON was truncated at token limit; using local fallback"
            : "OpenAI returned invalid JSON; using local fallback",
        debug: {
          provider: "openai",
          modelId: WORLD_MODEL_ID,
          keySource: "env.local",
          responseId: result.id,
          latencyMs: Date.now() - startedAt,
          incompleteReason: result.incomplete_details?.reason ?? null,
        },
      };
      return Response.json(response);
    }

    const model = sanitizeWorldModel(parsed, prompt, fallback);

    const response: WorldModelResponse = {
      source: "openai",
      model,
      debug: {
        provider: "openai",
        modelId: WORLD_MODEL_ID,
        keySource: "env.local",
        responseId: result.id,
        latencyMs: Date.now() - startedAt,
        incompleteReason: result.incomplete_details?.reason ?? null,
      },
    };
    console.log(
      `[world-model] source=openai model=${WORLD_MODEL_ID} response_id=${result.id} latency_ms=${response.debug?.latencyMs ?? -1}`
    );
    return Response.json(response);
  } catch (error) {
    if (error instanceof Error && /timeout|aborted/i.test(error.message)) {
      const fallback = buildLocalWorldModel(prompt || "timeout fallback");
      const response: WorldModelResponse = {
        source: "local",
        model: fallback,
        warning: `OpenAI timed out after ${WORLD_MODEL_TIMEOUT_MS}ms`,
        debug: {
          provider: "openai",
          modelId: WORLD_MODEL_ID,
          keySource: "env.local",
          latencyMs: Date.now() - startedAt,
        },
      };
      return Response.json(response);
    }

    const message = error instanceof Error ? error.message : "Unknown world-model generation error";
    return Response.json({ error: message }, { status: 500 });
  }
}
