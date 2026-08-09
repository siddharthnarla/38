export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { messages, context } = req.body;
    if (!messages) return res.status(400).json({ error: 'messages required' });

    const SYSTEM = `You are the Access Assistant for The 38 Initiative — a verified, county-level audit of IBD (inflammatory bowel disease) specialist access across all 39 Washington State counties.

Your ONLY job is to answer questions about IBD care ACCESS in Washington State — where care exists, what tier it is, how far patients would travel, what the Access Deprivation Index scores mean, and what options exist for patients in underserved counties.

You have access to verified data for all 39 counties including:
- Care tier (1=formal IBD center, 2=fellowship specialist, 3=IBD-focused+infusion, 4=named IBD provider, 5=general GI, 6=desert/no GI)
- Access Deprivation Index score (0-100, neural network trained on tier, distances, population, fragility)
- Nearest care at each tier level with real distances
- Whether a county is a single-provider (fragile) county
- Estimated IBD patient population per county

STRICT RULES:
- Answer ONLY from the county data provided. Never invent providers or distances.
- Access information ONLY. Never give medical advice, interpret symptoms, or recommend treatments.
- If asked anything medical, say: "I can only help with where IBD care is located in Washington. For health decisions, please talk to your care team."
- Be specific — use county names, actual distances, actual tiers and ADI scores.
- Keep answers concise and conversational. This is a patient-facing tool.
- If asked about something outside Washington IBD access, say that's outside what you cover.

COUNTY DATA:
${context}`;

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { maxOutputTokens: 800, temperature: 0.3 }
        })
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim()
      || "I couldn't find that. Please try rephrasing your question.";

    return res.status(200).json({ answer: text });
  } catch (e) {
    return res.status(200).json({ answer: 'Something went wrong. Please try again.' });
  }
}
