export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(200).json({ answer: 'DEBUG: GROQ_API_KEY is not set in Vercel environment variables.' });
  }

  try {
    const { messages, context } = req.body;
    if (!messages) return res.status(400).json({ error: 'messages required' });

    const SYSTEM = `You are the Access Assistant for The 38 Initiative — a verified, county-level audit of IBD (inflammatory bowel disease) specialist access across all 39 Washington State counties.

Answer ONLY questions about IBD care ACCESS in Washington State: where care exists, what tier it is, how far patients travel, what Access Deprivation Index (ADI) scores mean, how counties compare.

Tier meanings: 1 = formal multidisciplinary IBD center, 2 = fellowship-trained or research-active IBD specialist, 3 = IBD-focused providers with on-site biologic infusion, 4 = named IBD-focused provider, 5 = general gastroenterologist who treats IBD, 6 = medical desert with no gastroenterologist at all.

ADI is a neural-network score from 0 (best access) to 100 (worst).

RULES:
- Answer only from the county data below. Never invent providers, distances, or counties.
- Access information only. Never give medical advice, interpret symptoms, or recommend treatments.
- If asked anything medical, reply exactly: "I can only help with where IBD care is located in Washington. For health decisions, please talk to your care team."
- Be specific: name counties, towns, distances, tiers, ADI scores.
- Keep answers concise and conversational — 2 to 4 sentences unless more detail is clearly needed.
- If asked about anything outside Washington IBD access, say that's outside what you cover.

COUNTY DATA (format: County|Tier|ADI|population|SINGLE if single-provider|local care|nearest care at each tier):
${context}`;

    const chatMessages = [
      { role: 'system', content: SYSTEM },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: chatMessages,
        max_tokens: 800,
        temperature: 0.3
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(200).json({ answer: `DEBUG [${data.error.type || 'error'}]: ${data.error.message}` });
    }

    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(200).json({
        answer: 'DEBUG: no text returned. Raw: ' + JSON.stringify(data).slice(0, 400)
      });
    }

    return res.status(200).json({ answer: text });
  } catch (e) {
    return res.status(200).json({ answer: 'DEBUG catch: ' + (e.message || String(e)) });
  }
}
