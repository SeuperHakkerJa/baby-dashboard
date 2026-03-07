# Mother Dashboard (One-Page Prompt Pipeline)

## Pipeline behavior
- Raw sensor input stream is always simulated locally:
  - `lightLux`
  - `cameraColorK`
  - `acousticDb`
  - `temperatureC`
- Dashboard is monitor-only (no manual sensor sliders).
- If no prompt/model is generated, the derived board stays in an idle state.
- Press **Generate World Model** to call AI once (`/api/world-model`):
  - AI returns 4-6 derived world-state variables + weighted formulas.
  - From then on, derived values are computed locally each second.
- Theater supports stream monitoring in two modes:
  - raw telemetry history
  - derived world-state history
- Birth/genome JSON appears only when birth-window gate is reached.

## Main files
- `Life3Dashboard.tsx` : one-page UI + state flow
- `lib/dashboard/pipeline.ts` : stream simulation + formula execution
- `lib/dashboard/decision.ts` : aggregate/hazard/forecast + genome candidate synthesis
- `app/api/world-model/route.ts` : one-shot model generation endpoint
- `lib/dashboard/themes.ts` : dark zen/futuristic theme tokens
  - includes `Cipher` (default) for a classified cinematic look

## Run
1. `npm i`
2. `npm run tw:build`
3. ensure `.env.local` has `OPENAI_API_KEY=...`
4. `npm run dev`
5. open `http://localhost:3000`

## Notes
- If OpenAI is unavailable, `/api/world-model` falls back to a deterministic local model.
- Run `npm run tw:build` after changing utility classes in `Life3Dashboard.tsx`.
