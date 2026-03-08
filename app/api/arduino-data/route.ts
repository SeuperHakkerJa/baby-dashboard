const ARDUINO_DATA_URL = process.env.ARDUINO_DATA_URL ?? "http://192.168.41.224/data";
const ARDUINO_TIMEOUT_MS = Number(process.env.ARDUINO_TIMEOUT_MS ?? 1800);

type ArduinoRaw = {
  temp?: number;
  humidity?: number;
  light?: number;
  light_state?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function GET() {
  try {
    const response = await fetch(ARDUINO_DATA_URL, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(ARDUINO_TIMEOUT_MS),
    });

    if (!response.ok) {
      return Response.json({ error: `Arduino endpoint returned ${response.status}` }, { status: 502 });
    }

    const payload = (await response.json()) as ArduinoRaw;
    if (!isFiniteNumber(payload.temp) || !isFiniteNumber(payload.humidity) || !isFiniteNumber(payload.light)) {
      return Response.json({ error: "Arduino payload missing numeric fields: temp, humidity, light" }, { status: 502 });
    }

    const temperatureC = Number(payload.temp.toFixed(2));
    const temperatureF = Number((temperatureC * 9 / 5 + 32).toFixed(1));
    const humidityPct = Number(clamp(payload.humidity, 0, 100).toFixed(1));
    const lightLevel = Number(clamp(payload.light, 0, 4095).toFixed(0));
    const lightState = typeof payload.light_state === "string" ? payload.light_state.toUpperCase() : "UNKNOWN";

    return Response.json({
      source: "arduino",
      reading: {
        temperatureC,
        temperatureF,
        humidityPct,
        lightLevel,
        lightState,
      },
      fetchedAt: new Date().toISOString(),
      endpoint: ARDUINO_DATA_URL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Arduino fetch failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
