const ACTUATOR_SIGNAL_URL = process.env.ACTUATOR_SIGNAL_URL ?? "";
const ACTUATOR_TIMEOUT_MS = Number(process.env.ACTUATOR_TIMEOUT_MS ?? 2200);

type SendSignalRequest = {
  snapshot?: {
    capturedAt?: string;
    tick?: number;
    hotSeconds?: number;
    monitorThresholdF?: number;
    sensors?: Record<string, unknown>;
    derived?: unknown[];
  };
  realizedProjection?: {
    pumpPower?: number;
    microServoAngle?: number;
    lightColor?: string;
  };
  realizedTraits?: {
    speed?: number;
    breathingRate?: number;
    bodySize?: number;
    mode?: string;
  };
  source?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidAngle(value: number) {
  return value === -90 || value === -45 || value === 0 || value === 45 || value === 90;
}

function normalizeColor(value: string) {
  const color = value.toLowerCase();
  if (color === "red" || color === "green" || color === "blue") return color;
  return null;
}

export async function POST(req: Request) {
  try {
    if (!ACTUATOR_SIGNAL_URL) {
      return Response.json(
        { error: "ACTUATOR_SIGNAL_URL is not configured in .env.local" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as SendSignalRequest;
    const projection = body.realizedProjection;
    if (!projection || !isFiniteNumber(projection.pumpPower) || !isFiniteNumber(projection.microServoAngle) || typeof projection.lightColor !== "string") {
      return Response.json({ error: "Valid realizedProjection is required" }, { status: 400 });
    }
    if (!isValidAngle(projection.microServoAngle)) {
      return Response.json({ error: "realizedProjection.microServoAngle must be one of -90, -45, 0, 45, 90" }, { status: 400 });
    }
    const color = normalizeColor(projection.lightColor);
    if (!color) {
      return Response.json({ error: "realizedProjection.lightColor must be red, green, or blue" }, { status: 400 });
    }

    const signal = {
      schema: "life3.realizable.signal.v1",
      sentAt: new Date().toISOString(),
      source: body.source ?? "unknown",
      trigger: {
        capturedAt: body.snapshot?.capturedAt ?? null,
        tick: body.snapshot?.tick ?? null,
        hotSeconds: body.snapshot?.hotSeconds ?? null,
        monitorThresholdF: body.snapshot?.monitorThresholdF ?? null,
      },
      sensors: body.snapshot?.sensors ?? {},
      worldModelSnapshot: body.snapshot?.derived ?? [],
      realizedTraits: body.realizedTraits ?? {},
      realizableSignal: {
        pumpPowerPct: projection.pumpPower,
        angle: projection.microServoAngle,
        color,
      },
    };

    const upstream = await fetch(ACTUATOR_SIGNAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
      signal: AbortSignal.timeout(ACTUATOR_TIMEOUT_MS),
    });

    const text = await upstream.text();
    const preview = text.length > 240 ? `${text.slice(0, 240)}...` : text;

    if (!upstream.ok) {
      return Response.json(
        {
          error: `Destination rejected signal (${upstream.status})`,
          destination: ACTUATOR_SIGNAL_URL,
          upstreamStatus: upstream.status,
          upstreamBodyPreview: preview,
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      destination: ACTUATOR_SIGNAL_URL,
      upstreamStatus: upstream.status,
      upstreamBodyPreview: preview || "empty body",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send realizable signal";
    return Response.json({ error: message }, { status: 502 });
  }
}
