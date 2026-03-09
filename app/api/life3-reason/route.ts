import OpenAI from "openai";

import { readStrictOpenAIKeyFromEnvLocal } from "../../../lib/dashboard/env";
import { parseJsonLoose, stripJsonCodeFence } from "../../../lib/dashboard/json";
import { localPlanner } from "../../../lib/dashboard/model";
import { buildPlannerPrompt } from "../../../lib/dashboard/prompts";
import type { PlannerPayload, PlannerResponse } from "../../../lib/dashboard/types";

const PLANNER_MODEL_ID = process.env.OPENAI_PLANNER_MODEL ?? "gpt-5-nano";
const PLANNER_TIMEOUT_MS = Number(process.env.OPENAI_PLANNER_TIMEOUT_MS ?? 20000);

function normalizePlannerResponse(candidate: unknown, fallback: PlannerResponse): PlannerResponse {
  if (!candidate || typeof candidate !== "object") return fallback;

  const raw = candidate as Record<string, unknown>;
  const maybeBaby = raw.babyConfig;

  if (typeof raw.shouldBirth !== "boolean") return fallback;
  if (typeof raw.windowMinutes !== "number" || Number.isNaN(raw.windowMinutes)) return fallback;
  if (typeof raw.confidence !== "number" || Number.isNaN(raw.confidence)) return fallback;
  if (!maybeBaby || typeof maybeBaby !== "object") return fallback;

  return {
    ...fallback,
    ...raw,
    babyConfig: {
      ...fallback.babyConfig,
      ...(maybeBaby as Record<string, unknown>),
      decision: {
        ...fallback.babyConfig.decision,
        ...((maybeBaby as Record<string, unknown>).decision as Record<string, unknown>),
      },
      genome: {
        ...fallback.babyConfig.genome,
        ...((maybeBaby as Record<string, unknown>).genome as Record<string, unknown>),
      },
    },
  } as PlannerResponse;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      payload?: PlannerPayload;
      generation?: number;
    };

    if (!body.payload) {
      return Response.json({ error: "Missing payload" }, { status: 400 });
    }

    const generation = Math.max(1, Math.floor(body.generation ?? 1));
    const fallback = localPlanner(body.payload, generation);
    const strictKey = readStrictOpenAIKeyFromEnvLocal();
    const client = strictKey ? new OpenAI({ apiKey: strictKey }) : null;

    if (!client) {
      return Response.json({ ...fallback, source: "local", warning: "OPENAI_API_KEY missing in .env.local" });
    }

    const response = await client.responses.create({
      model: PLANNER_MODEL_ID,
      input: buildPlannerPrompt(body.payload, generation),
      max_output_tokens: 1100,
      store: false,
      reasoning: { effort: "minimal" },
      text: {
        format: { type: "json_object" },
        verbosity: "low",
      },
    }, {
      timeout: PLANNER_TIMEOUT_MS,
    });

    const cleaned = stripJsonCodeFence(response.output_text?.trim() ?? "");

    if (!cleaned) {
      return Response.json({ ...fallback, source: "local", warning: "Empty model output" });
    }

    const parsed = parseJsonLoose(cleaned);
    if (!parsed) {
      return Response.json({
        ...fallback,
        source: "local",
        warning:
          response.incomplete_details?.reason === "max_output_tokens"
            ? "Planner JSON truncated at token limit; using local fallback"
            : "Planner returned invalid JSON; using local fallback",
      });
    }

    const normalized = normalizePlannerResponse(parsed, fallback);

    return Response.json({ ...normalized, source: "openai" });
  } catch (error) {
    if (error instanceof Error && /timeout|aborted/i.test(error.message)) {
      return Response.json({ error: `Planner timed out after ${PLANNER_TIMEOUT_MS}ms` }, { status: 504 });
    }

    const message = error instanceof Error ? error.message : "Unknown API route error";
    return Response.json({ error: message }, { status: 500 });
  }
}
