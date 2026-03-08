const ARDUINO_DATA_URL = process.env.ARDUINO_DATA_URL ?? "";
const ARDUINO_SENDER_SIGNAL_URL = process.env.ARDUINO_SENDER_SIGNAL_URL ?? "";
const ARDUINO_SENDER_SIGNAL_TIMEOUT_MS = Number(process.env.ARDUINO_SENDER_SIGNAL_TIMEOUT_MS ?? 2000);

type SenderSignalRequest = {
  snapshot?: {
    capturedAt?: string;
    tick?: number;
    hotSeconds?: number;
    monitorThresholdF?: number;
    sensors?: Record<string, unknown>;
    derived?: unknown[];
  };
  triggerMode?: "auto" | "retry";
};

function resolveSenderSignalUrl() {
  if (ARDUINO_SENDER_SIGNAL_URL) return ARDUINO_SENDER_SIGNAL_URL;
  if (!ARDUINO_DATA_URL) return "";

  try {
    const url = new URL(ARDUINO_DATA_URL);
    url.pathname = "/command";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const senderSignalUrl = resolveSenderSignalUrl();
    if (!senderSignalUrl) {
      return Response.json(
        { error: "Set ARDUINO_SENDER_SIGNAL_URL (or ARDUINO_DATA_URL) in .env.local" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as SenderSignalRequest;
    const mode = body.triggerMode === "retry" ? "retry" : "auto";

    const signal = {
      schema: "life3.sender.prep.v1",
      sentAt: new Date().toISOString(),
      action: "prep_pump",
      triggerMode: mode,
      trigger: {
        capturedAt: body.snapshot?.capturedAt ?? null,
        tick: body.snapshot?.tick ?? null,
        hotSeconds: body.snapshot?.hotSeconds ?? null,
        monitorThresholdF: body.snapshot?.monitorThresholdF ?? null,
      },
      sensors: body.snapshot?.sensors ?? {},
      worldModelSnapshot: body.snapshot?.derived ?? [],
    };

    const upstream = await fetch(senderSignalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
      signal: AbortSignal.timeout(ARDUINO_SENDER_SIGNAL_TIMEOUT_MS),
    });

    const text = await upstream.text();
    const preview = text.length > 240 ? `${text.slice(0, 240)}...` : text;

    if (!upstream.ok) {
      return Response.json(
        {
          error: `Sender rejected signal (${upstream.status})`,
          destination: senderSignalUrl,
          upstreamStatus: upstream.status,
          upstreamBodyPreview: preview,
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      destination: senderSignalUrl,
      upstreamStatus: upstream.status,
      upstreamBodyPreview: preview || "empty body",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send sender callback signal";
    return Response.json({ error: message }, { status: 502 });
  }
}
