import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { env, genome } = await req.json();

    const prompt = `
You are the reproductive intelligence of a mother robot.
Return ONLY valid JSON with this exact shape:
{
  "summary": string,
  "hiddenBeliefs": [{"label": string, "value": number}],
  "candidates": [{"id": string, "name": string, "score": number, "classLabel": string, "rationale": string, "mutations": string[]}],
  "chosenName": string,
  "chosenReason": string
}

Rules:
- hiddenBeliefs must include exactly these labels: attention_risk, stealth_need, offspring_viability, adaptation_pressure, social_fragility
- each value must be 0-100
- produce exactly 3 candidates
- keep candidate names in the style: Embryo Alpha, Embryo Beta, Embryo Gamma
- mutations should be short phenotype phrases
- this is a dashboard for a hackathon demo, so write concise but dramatic scientific language

Environment JSON:
${JSON.stringify(env, null, 2)}

Genome JSON:
${JSON.stringify(genome, null, 2)}
`;

    const response = await client.responses.create({
      model: "gpt-5-nano",
      input: prompt,
    });

    const text = response.output_text?.trim() ?? "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    return Response.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
