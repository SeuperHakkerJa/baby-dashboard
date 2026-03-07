import fs from "node:fs";
import path from "node:path";

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function readEnvLocalVar(name: string): string | null {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return null;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  let resolved: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    if (match[1] !== name) continue;

    resolved = unquote(match[2].trim());
  }

  if (!resolved) return null;
  return resolved.length > 0 ? resolved : null;
}

export function readStrictOpenAIKeyFromEnvLocal() {
  return readEnvLocalVar("OPENAI_API_KEY");
}
