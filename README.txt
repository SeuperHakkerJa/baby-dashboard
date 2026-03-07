Files in this pack:
- Life3Dashboard.tsx
- app/api/life3-reason/route.ts

Quick start:
1. npm i framer-motion lucide-react recharts openai
2. Put Life3Dashboard.tsx somewhere in your React / Next app.
3. Put route.ts at app/api/life3-reason/route.ts if using Next.js App Router.
4. Set OPENAI_API_KEY on the server.
5. Render <Life3Dashboard />.

Notes:
- Sensor data is fake/live-generated in the dashboard.
- AI reasoning is expected to be real through the backend route.
- If the backend route fails, the UI falls back to a local fake reasoner so the demo does not die.
