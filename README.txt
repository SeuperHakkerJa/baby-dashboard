# Systems Dashboard (One-Page Prompt Pipeline)

## Pipeline behavior
- Raw sensor input is pulled from Arduino over LAN via `GET /api/arduino-data`:
  - `temp` (C, converted to F internally for trigger logic)
  - `humidity`
  - `light`
  - `light_state` (shown as a separate status block)
- Dashboard is monitor-only (no manual sensor sliders).
- If no prompt/model is generated, the derived board stays in an idle state.
- Press **Generate World Model** to call AI once (`/api/world-model`):
  - AI returns 3-4 generated derived world-state variables + weighted formulas.
  - Generated derived states are rendered as `objective: none` with threshold display off.
  - App also appends 2 fixed identity states:
    - `Surrounding Temperature = temperatureF`
    - `Photon Flux = lightLevel` (monitor threshold: 3000)
  - From then on, derived values are computed locally each second.
- When a baby popup is triggered, the app auto-sends a prep signal back to the sender Arduino (`/api/sender-signal`), and the popup includes a **retry sender signal** button.
- Baby generation also includes a short model-written interpretation line (up to 40 words) describing the current world-model situation and desired offspring profile before hardware realization constraints.
- Theater supports stream monitoring in two modes:
  - raw telemetry history
  - derived world-state history

## Main files
- `Life3Dashboard.tsx` : one-page UI + state flow
- `lib/dashboard/pipeline.ts` : stream simulation + formula execution
- `lib/dashboard/decision.ts` : aggregate/hazard/forecast scoring logic
- `app/api/world-model/route.ts` : one-shot model generation endpoint
- `app/api/arduino-data/route.ts` : LAN proxy for Arduino sensor payload
- `app/api/actuator-signal/route.ts` : forwards realized baby signal to actuator device
- `app/api/sender-signal/route.ts` : sends prep callback signal to the sender Arduino on baby trigger
- `lib/dashboard/world-model-prompt.ts` : standalone prompt text for derived-state generation
- `lib/dashboard/themes.ts` : dark zen/futuristic theme tokens
  - includes `Obsidian` (default) for a black + amber classified look

## Run
1. `npm i`
2. `npm run tw:build`
3. ensure `.env.local` has `OPENAI_API_KEY=...`
   - optional Arduino input source:
     - `ARDUINO_DATA_URL=http://192.168.41.224/data`
   - optional sender callback destination (defaults to same host as `ARDUINO_DATA_URL` with `/TRIGGER_BABY` path):
     - `ARDUINO_SENDER_SIGNAL_URL=http://192.168.41.224/TRIGGER_BABY`
   - optional sender trigger path when `ARDUINO_SENDER_SIGNAL_URL` is not set:
     - `ARDUINO_SENDER_TRIGGER_PATH=/TRIGGER_BABY`
   - optional actuator destination for send button:
     - `ACTUATOR_SIGNAL_URL=http://192.168.41.XXX:PORT/command`
4. `npm run dev`
5. open `http://localhost:3000`

## Notes
- If OpenAI is unavailable, `/api/world-model` falls back to a deterministic local model.
- Run `npm run tw:build` after changing utility classes in `Life3Dashboard.tsx`.

## Actuator Signal Contract
- Route: `POST /api/actuator-signal`
- `realizableSignal` payload keys are:
  - `pumpPowerPct`: `50 | 75 | 100`
  - `angle`: `-90 | -45 | 0 | 45 | 90`
  - `color`: `"red" | "green" | "blue"`
