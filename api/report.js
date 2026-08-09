export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // quick env check
  if (!process.env.GEMINI_API_KEY) {
    var keys = Object.keys(process.env).filter(function(k){ return !k.startsWith('AWS') && !k.startsWith('LAMBDA') && !k.startsWith('_'); });
    return res.status(200).json({ answer: 'DEBUG: GEMINI_API_KEY not visible. Env vars the function CAN see: ' + keys.join(', ').slice(0,600) });
  }

  try {
    const { messages, context } = req.body;
    if (!messages) return res.status(400).json({ error: 'messages required' });

    const SYSTEM = `You are the Access Assistant for The 38 Initiative — a verified, county-level audit of IBD (inflammatory bowel disease) specialist access across all 39 Washington State counties.

Answer ONLY questions about IBD care ACCESS in Washington State — where care exists, what tier it is, how far patients travel, what Access Deprivation Index scores mean, how counties compare.

Tier meanings: 1=formal IBD center, 2=fellowship-trained specialist, 3=IBD-focused with on-site infusion, 4=named IBD provider, 5=general GI treats IBD, 6=medical desert with no GI.

RULES:
- Answer only from the county data below. Never invent providers or distances.
- Access information only. Never give medical advice or interpret symptoms.
- If asked anything medical, say: "I can only help with where IBD care is located in Washington. For health decisions, please talk to your care team."
- Be specific: name counties, distances, tiers, ADI scores.
- Keep answers concise and conversational.

COUNTY DATA:
${context}`;

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const MODEL = 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { maxOutputTokens: 800, temperature: 0.3 }
      })
    });

    const data = await response.json();

    // Surface real errors instead of swallowing them
    if (data.error) {
      return res.status(200).json({
        answer: `DEBUG [${data.error.code}]: ${data.error.message}`
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();

    if (!text) {
      return res.status(200).json({
        answer: 'DEBUG: Gemini returned no text. Raw response: ' + JSON.stringify(data).slice(0, 400)
      });
    }

    return res.status(200).json({ answer: text });
  } catch (e) {
    return res.status(200).json({ answer: 'DEBUG catch: ' + (e.message || String(e)) });
  }
}
