const ARDUINO_DATA_URL = process.env.ARDUINO_DATA_URL ?? "";
const ARDUINO_SENDER_SIGNAL_URL = process.env.ARDUINO_SENDER_SIGNAL_URL ?? "";
const ARDUINO_SENDER_TRIGGER_PATH = process.env.ARDUINO_SENDER_TRIGGER_PATH ?? "/TRIGGER_BABY";
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
    const normalizedPath = ARDUINO_SENDER_TRIGGER_PATH.startsWith("/")
      ? ARDUINO_SENDER_TRIGGER_PATH
      : `/${ARDUINO_SENDER_TRIGGER_PATH}`;
    url.pathname = normalizedPath;
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

    // Sender Arduino trigger contract: hitting this URL itself is the trigger.
    const triggerUrl = new URL(senderSignalUrl);
    triggerUrl.searchParams.set("mode", mode);
    if (body.snapshot?.tick != null) triggerUrl.searchParams.set("tick", String(body.snapshot.tick));
    if (body.snapshot?.hotSeconds != null) triggerUrl.searchParams.set("hotSeconds", String(body.snapshot.hotSeconds));

    const upstream = await fetch(triggerUrl.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(ARDUINO_SENDER_SIGNAL_TIMEOUT_MS),
    });

    const text = await upstream.text();
    const preview = text.length > 240 ? `${text.slice(0, 240)}...` : text;

    if (!upstream.ok) {
      return Response.json(
        {
          error: `Sender rejected signal (${upstream.status})`,
          destination: triggerUrl.toString(),
          upstreamStatus: upstream.status,
          upstreamBodyPreview: preview,
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      destination: triggerUrl.toString(),
      upstreamStatus: upstream.status,
      upstreamBodyPreview: preview || "empty body",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send sender callback signal";
    return Response.json({ error: message }, { status: 502 });
  }
}
